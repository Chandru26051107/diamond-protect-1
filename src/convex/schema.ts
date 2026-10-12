import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/**
 * DIAMOND-PROTECT shared validators.
 *
 * Everything in the `dp*` + domain tables below is SYNTHETIC hackathon demo
 * data. There is no connection to UPI, NPCI, banks or any real financial
 * system anywhere in this project.
 */
export const riskCategoryValidator = v.union(
  v.literal("DIAMOND_SAFE"),
  v.literal("DIAMOND_CAUTION"),
  v.literal("DIAMOND_ALERT"),
);
export type RiskCategory = Infer<typeof riskCategoryValidator>;

export const decisionValidator = v.union(
  v.literal("PROCEED"),
  v.literal("VERIFY_BENEFICIARY"),
  v.literal("EXTRA_AUTH"),
  v.literal("DO_NOT_PAY"),
);
export type Decision = Infer<typeof decisionValidator>;

export const accountStatusValidator = v.union(
  v.literal("NORMAL"),
  v.literal("SUSPICIOUS"),
  v.literal("MULE_SUSPECT"),
  v.literal("BLOCKED"),
  v.literal("UNDER_REVIEW"),
  v.literal("CLEARED"),
);
export type AccountStatus = Infer<typeof accountStatusValidator>;

export const riskLevelValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
);

export const qrStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("EXPIRED"),
  v.literal("REVOKED"),
  v.literal("TAMPERED"),
);
export type QrStatus = Infer<typeof qrStatusValidator>;

export const caseStatusValidator = v.union(
  v.literal("NEW"),
  v.literal("INVESTIGATING"),
  v.literal("ESCALATED"),
  v.literal("RESOLVED"),
  v.literal("FALSE_POSITIVE"),
);
export type CaseStatus = Infer<typeof caseStatusValidator>;

export const riskSignalValidator = v.object({
  ruleId: v.string(),
  label: v.string(),
  detail: v.string(),
  weight: v.number(),
  layer: v.union(
    v.literal("RULE"),
    v.literal("ML"),
    v.literal("GRAPH"),
    v.literal("QR"),
  ),
});

export const timelineEntryValidator = v.object({
  at: v.number(),
  actor: v.string(),
  action: v.string(),
  note: v.optional(v.string()),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---------------------------------------------------------------------
    // DIAMOND-PROTECT : synthetic UPI account directory (graph nodes)
    // ---------------------------------------------------------------------
    accounts: defineTable({
      accountId: v.string(), // USR0001 / MER0007
      name: v.string(),
      upiId: v.string(),
      kind: v.union(v.literal("USER"), v.literal("MERCHANT")),
      createdAt: v.number(),
      accountAgeDays: v.number(),
      riskLevel: riskLevelValidator,
      isMuleSuspect: v.boolean(),
      status: accountStatusValidator,
      category: v.optional(v.string()),
      city: v.optional(v.string()),
      isVerified: v.optional(v.boolean()),
      // MuleNet graph metrics
      inDegree: v.number(),
      outDegree: v.number(),
      totalReceived: v.number(),
      totalSent: v.number(),
      outflowRatio: v.number(),
      uniqueSenders: v.number(),
      uniqueReceivers: v.number(),
      avgReceiveToSendSec: v.number(),
      clustering: v.number(),
      community: v.number(),
      communityMuleCount: v.optional(v.number()),
      fraudCluster: v.optional(v.number()),
      clusterRole: v.optional(v.string()),
      fraudClusterSize: v.optional(v.number()),
      fraudClusterReach: v.optional(v.number()),
      fraudClusterValue: v.optional(v.number()),
      fraudClusterMules: v.optional(v.number()),
      riskScore: v.number(), // 0-100
      flaggedReasons: v.array(v.string()),
    })
      .index("by_accountId", ["accountId"])
      .index("by_upiId", ["upiId"])
      .index("by_status", ["status"])
      .index("by_riskScore", ["riskScore"])
      .index("by_community", ["community"]),

    // ---------------------------------------------------------------------
    // Synthetic merchants with signed QR capability
    // ---------------------------------------------------------------------
    merchants: defineTable({
      merchantId: v.string(),
      merchantName: v.string(),
      upiId: v.string(),
      category: v.string(),
      city: v.string(),
      isVerified: v.boolean(),
      qrSecretVersion: v.number(),
      status: v.union(
        v.literal("ACTIVE"),
        v.literal("REVOKED"),
        v.literal("SUSPENDED"),
      ),
      registeredAt: v.number(),
      totalQrCodes: v.number(),
      flaggedCount: v.number(),
    })
      .index("by_merchantId", ["merchantId"])
      .index("by_upiId", ["upiId"]),

    // ---------------------------------------------------------------------
    // Scored transactions
    // ---------------------------------------------------------------------
    transactions: defineTable({
      txnId: v.string(),
      userId: v.string(),
      userName: v.string(),
      userUpiId: v.string(),
      beneficiaryId: v.string(),
      beneficiaryName: v.string(),
      beneficiaryUpiId: v.string(),
      amount: v.number(),
      timestamp: v.number(),
      deviceId: v.string(),
      location: v.string(),
      txnType: v.union(
        v.literal("P2P"),
        v.literal("P2M_QR"),
        v.literal("P2M_ONLINE"),
        v.literal("COLLECT"),
      ),
      qrId: v.optional(v.string()),
      qrStatus: v.union(
        v.literal("VERIFIED"),
        v.literal("CAUTION"),
        v.literal("FAKE_TAMPERED"),
        v.literal("NOT_USED"),
      ),
      ruleScore: v.number(),
      mlProbability: v.number(),
      graphScore: v.number(),
      diamondTrustScore: v.number(),
      riskCategory: riskCategoryValidator,
      decision: decisionValidator,
      reasons: v.array(v.string()),
      signals: v.array(riskSignalValidator),
      features: v.any(), // feature vector snapshot used for scoring
      recommendedAction: v.string(),
      explanation: v.string(),
      fraudPattern: v.string(), // NORMAL / FAKE_QR / MULE_INFLOW ...
      isFraudLabel: v.boolean(),
      lossPrevented: v.number(),
      reported: v.boolean(),
    })
      .index("by_txnId", ["txnId"])
      .index("by_timestamp", ["timestamp"])
      .index("by_userId", ["userId"])
      .index("by_beneficiaryId", ["beneficiaryId"])
      .index("by_decision", ["decision"])
      .index("by_trust", ["diamondTrustScore"]),

    // ---------------------------------------------------------------------
    // Signed QR codes (HMAC-SHA256)
    // ---------------------------------------------------------------------
    qrCodes: defineTable({
      qrId: v.string(),
      merchantId: v.string(),
      merchantName: v.string(),
      upiId: v.string(),
      amount: v.number(),
      createdAt: v.number(),
      expiresAt: v.number(),
      nonce: v.string(),
      version: v.number(),
      signature: v.string(),
      payload: v.string(), // canonical JSON that was signed
      status: qrStatusValidator,
      isTampered: v.boolean(),
      tamperMode: v.optional(v.string()),
      city: v.string(),
    })
      .index("by_qrId", ["qrId"])
      .index("by_merchantId", ["merchantId"])
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"]),

    // ---------------------------------------------------------------------
    // Fraud cases raised from the User Payment Shield
    // ---------------------------------------------------------------------
    fraudCases: defineTable({
      caseId: v.string(),
      txnId: v.string(),
      reportedBy: v.string(),
      beneficiaryId: v.optional(v.string()),
      beneficiaryUpiId: v.optional(v.string()),
      amount: v.number(),
      reason: v.string(),
      status: caseStatusValidator,
      priority: v.union(
        v.literal("LOW"),
        v.literal("MEDIUM"),
        v.literal("HIGH"),
        v.literal("CRITICAL"),
      ),
      assignedTo: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      resolvedAt: v.optional(v.number()),
      analystNotes: v.string(),
      diamondTrustScore: v.number(),
      timeline: v.array(timelineEntryValidator),
    })
      .index("by_caseId", ["caseId"])
      .index("by_status", ["status"])
      .index("by_txnId", ["txnId"])
      .index("by_createdAt", ["createdAt"]),

    // ---------------------------------------------------------------------
    // Audit trail for every analyst action
    // ---------------------------------------------------------------------
    auditLogs: defineTable({
      logId: v.string(),
      actor: v.string(),
      action: v.string(),
      entityType: v.string(),
      entityId: v.string(),
      timestamp: v.number(),
      details: v.string(),
    })
      .index("by_timestamp", ["timestamp"])
      .index("by_entityId", ["entityId"]),

    // ---------------------------------------------------------------------
    // Rule Control Panel configuration (single document, key "global")
    // ---------------------------------------------------------------------
    settings: defineTable({
      key: v.string(),
      highRiskThreshold: v.number(),
      mlThreshold: v.number(),
      newBeneficiaryWindowHours: v.number(),
      rapidTransactionWindowMin: v.number(),
      rapidForwardingThreshold: v.number(),
      graphSensitivity: v.number(),
      highAmountThreshold: v.number(),
      ruleToggles: v.any(), // Record<ruleId, boolean>
      qrValidityMinutes: v.number(),
      updatedAt: v.number(),
      updatedBy: v.string(),
    }).index("by_key", ["key"]),

    // ---------------------------------------------------------------------
    // In-app trained ML model artifacts + honest synthetic metrics
    // ---------------------------------------------------------------------
    modelArtifacts: defineTable({
      key: v.string(),
      modelType: v.string(),
      trainedAt: v.number(),
      trainSize: v.number(),
      testSize: v.number(),
      positiveRate: v.number(),
      bias: v.number(),
      features: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          mean: v.number(),
          std: v.number(),
          coef: v.number(),
          importance: v.number(),
        }),
      ),
      metrics: v.any(), // accuracy / precision / recall / f1 / rocAuc / confusion matrix
      trainingLog: v.array(v.string()),
    }).index("by_key", ["key"]),

    // ---------------------------------------------------------------------
    // Pre-aggregated command-centre KPIs (kept fresh on write)
    // ---------------------------------------------------------------------
    dashMetrics: defineTable({
      key: v.string(),
      totalTransactions: v.number(),
      highRiskTransactions: v.number(),
      blockedTransactions: v.number(),
      fraudLossPrevented: v.number(),
      avgTrustScore: v.number(),
      activeCases: v.number(),
      verifiedMerchants: v.number(),
      suspectedMuleAccounts: v.number(),
      flaggedQrCodes: v.number(),
      fraudRate: v.number(),
      trustedRate: v.number(),
      trend: v.array(
        v.object({
          day: v.string(),
          total: v.number(),
          fraud: v.number(),
          blocked: v.number(),
          avgScore: v.number(),
          lossPrevented: v.number(),
        }),
      ),
      scoreDistribution: v.array(
        v.object({ bucket: v.string(), count: v.number() }),
      ),
      patternBreakdown: v.array(
        v.object({ pattern: v.string(), count: v.number() }),
      ),
      topSuspicious: v.array(
        v.object({
          accountId: v.string(),
          name: v.string(),
          upiId: v.string(),
          riskScore: v.number(),
          status: v.string(),
          totalReceived: v.number(),
          flags: v.number(),
        }),
      ),
      modelSnapshot: v.any(),
      seededAt: v.number(),
    }).index("by_key", ["key"]),

    // ---------------------------------------------------------------------
    // Sampled MuleNet edge list (keeps the graph query cheap + reactive)
    // ---------------------------------------------------------------------
    graphEdges: defineTable({
      edgeId: v.string(),
      source: v.string(),
      target: v.string(),
      sourceName: v.string(),
      targetName: v.string(),
      amount: v.number(),
      risk: v.number(),
      timestamp: v.number(),
      fraudLabel: v.boolean(),
      suspicious: v.boolean(),
      community: v.number(),
    })
      .index("by_source", ["source"])
      .index("by_target", ["target"])
      .index("by_suspicious", ["suspicious"])
      .index("by_timestamp", ["timestamp"]),

    // ---------------------------------------------------------------------
    // Seeding lock so concurrent tabs cannot corrupt the demo dataset
    // ---------------------------------------------------------------------
    systemMeta: defineTable({
      key: v.string(),
      isSeeding: v.boolean(),
      startedAt: v.number(),
      seededAt: v.number(),
      version: v.number(),
      lastMessage: v.string(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
