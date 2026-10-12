/**
 * DIAMOND-PROTECT :: demo data seeding.
 *
 * The generator is idempotent: `seedDemoData` wipes every DIAMOND-PROTECT table
 * and regenerates a clean, deterministic synthetic dataset. Writes are batched
 * so a single function call never approaches Convex document limits.
 */

import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { generateDataset } from "./lib/dataset";
import { DEFAULT_CONFIG, type RuleConfig } from "./lib/types";

const TABLES = [
  "accounts",
  "merchants",
  "qrCodes",
  "transactions",
  "fraudCases",
  "auditLogs",
  "graphEdges",
  "dashMetrics",
  "modelArtifacts",
] as const;

const BATCH = 180;

export const claimSeed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("systemMeta")
      .withIndex("by_key", (q) => q.eq("key", "seed"))
      .unique();
    const now = Date.now();
    if (existing) {
      const stale = now - existing.startedAt > 300000;
      if (existing.isSeeding && !stale) {
        return { claimed: false, message: "Seeding already in progress." };
      }
      await ctx.db.patch(existing._id, {
        isSeeding: true,
        startedAt: now,
        lastMessage: "Generating synthetic ledger…",
      });
      return { claimed: true, message: "Seed lock acquired." };
    }
    await ctx.db.insert("systemMeta", {
      key: "seed",
      isSeeding: true,
      startedAt: now,
      seededAt: 0,
      version: 1,
      lastMessage: "Generating synthetic ledger…",
    });
    return { claimed: true, message: "Seed lock acquired." };
  },
});

export const releaseSeed = internalMutation({
  args: { message: v.string(), seededAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("systemMeta")
      .withIndex("by_key", (q) => q.eq("key", "seed"))
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      isSeeding: false,
      seededAt: args.seededAt || existing.seededAt,
      lastMessage: args.message,
    });
    return null;
  },
});

export const wipeTable = internalMutation({
  args: { table: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table as never).take(BATCH);
    for (const row of rows) {
      await ctx.db.delete((row as { _id: never })._id);
    }
    return rows.length;
  },
});

export const insertBatch = internalMutation({
  args: { table: v.string(), docs: v.array(v.any()) },
  handler: async (ctx, args) => {
    let written = 0;
    for (const doc of args.docs) {
      try {
        await ctx.db.insert(args.table as never, doc as never);
        written += 1;
      } catch {
        // A single malformed row must never abort the whole demo dataset.
      }
    }
    return written;
  },
});

export const settingsExists = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    return row !== null;
  },
});

async function wipeAll(ctx: ActionCtx) {
  for (const table of TABLES) {
    for (let guard = 0; guard < 200; guard++) {
      const deleted = await ctx.runMutation(internal.demoSeed.wipeTable, { table });
      if (deleted < BATCH) break;
    }
  }
}

async function insertAll(ctx: ActionCtx, table: string, docs: unknown[]) {
  for (let index = 0; index < docs.length; index += BATCH) {
    const slice = docs.slice(index, index + BATCH);
    await ctx.runMutation(internal.demoSeed.insertBatch, { table, docs: slice });
  }
}

type SeedResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  stats: (Record<string, number> & { elapsedMs: number }) | null;
};

/**
 * Generates (or regenerates) the full synthetic demo dataset.
 * Safe to call from the UI at any time: the old data is fully replaced.
 */
export const seedDemoData = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SeedResult> => {
    const started = Date.now();
    try {
      const claim: { claimed: boolean; message: string } = await ctx.runMutation(
        internal.demoSeed.claimSeed,
        {},
      );
      if (!claim.claimed && !args.force) {
        return { ok: false, skipped: true, message: claim.message, stats: null };
      }

      const existingSettings = await ctx.runQuery(internal.demoSeed.settingsExists, {});
      const config: RuleConfig = DEFAULT_CONFIG;

      const dataset = generateDataset(config, started);

      await wipeAll(ctx);
      await insertAll(ctx, "accounts", dataset.accounts);
      await insertAll(ctx, "merchants", dataset.merchants);
      await insertAll(ctx, "qrCodes", dataset.qrCodes);
      await insertAll(ctx, "transactions", dataset.transactions);
      await insertAll(ctx, "fraudCases", dataset.cases);
      await insertAll(ctx, "auditLogs", dataset.auditLogs);
      await insertAll(ctx, "graphEdges", dataset.graphEdges);
      await insertAll(ctx, "dashMetrics", [dataset.metrics]);
      await insertAll(ctx, "modelArtifacts", [
        {
          key: "global",
          modelType: dataset.model.modelType,
          trainedAt: dataset.model.trainedAt,
          trainSize: dataset.model.trainSize,
          testSize: dataset.model.testSize,
          positiveRate: dataset.model.positiveRate,
          bias: dataset.model.bias,
          features: dataset.model.features,
          metrics: dataset.model.metrics,
          trainingLog: dataset.model.trainingLog,
        },
      ]);
      if (!existingSettings) {
        await insertAll(ctx, "settings", [
          {
            key: "global",
            ...DEFAULT_CONFIG,
            updatedAt: Date.now(),
            updatedBy: "system",
          },
        ]);
      }

      const elapsed = Date.now() - started;
      await ctx.runMutation(internal.demoSeed.releaseSeed, {
        message: `Ready · ${dataset.stats.transactions} synthetic transactions seeded in ${(
          elapsed / 1000
        ).toFixed(1)}s`,
        seededAt: started,
      });

      return {
        ok: true,
        skipped: false,
        message: `Seeded ${dataset.stats.transactions} synthetic transactions, ${dataset.accounts.length} accounts and ${dataset.stats.cases} fraud cases.`,
        stats: { ...dataset.stats, elapsedMs: elapsed },
      };
    } catch (error) {
      try {
        await ctx.runMutation(internal.demoSeed.releaseSeed, {
          message: `Seeding failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
          seededAt: 0,
        });
      } catch {
        // ignore
      }
      return {
        ok: false,
        skipped: false,
        message:
          error instanceof Error
            ? `Could not generate demo data: ${error.message}`
            : "Could not generate demo data.",
        stats: null,
      };
    }
  },
});
