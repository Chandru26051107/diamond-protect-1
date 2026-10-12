# Judge-facing explanation — DIAMOND-PROTECT

> **"Every Payment. Protected."**
>
> **Prototype notice:** this is a hackathon prototype built using synthetic data. It does
> not connect to UPI, NPCI, banks, payment gateways or real financial systems, and the
> numbers below are measured on synthetic data — they are not production accuracy claims.

Numbers quoted here come from one seeded run of the current build (re-seed any time with
**Reset demo data**, then re-read them from **Command Centre → Overview**).

---

## 30-second answer

UPI fraud is caught *after* the money moves. DIAMOND-PROTECT scores the payment
**before authorisation** using three independent layers — QR signature verification, a
rules + ML behaviour score, and a transaction-graph analysis — and returns one
explainable number (0–100) plus a concrete action: proceed, verify, add authentication,
or do not pay.

## What version 1 protects against

All of it, because the three layers already cover these paths:

| Attack | Detected by |
| --- | --- |
| Fake / tampered QR stickers | Layer 1 — HMAC-SHA256 signature over the canonical payload |
| Merchant impersonation, payment redirection | Layer 1 — merchant identity + VPA match against the registry |
| New-beneficiary / urgency fraud | Layer 2 — beneficiary added seconds before payment, account age, amount anomaly |
| Rapid multiple payments, odd-hour activity | Layer 2 — burst window and hour-of-day rules |
| Device change / location anomaly | Layer 2 — device and city history for the payer |
| High-value fraud | Layer 2 — amount vs the account's own baseline |
| Mule-account inflow, rapid forwarding, mule networks | Layer 3 — fan-in/out, outflow ratio, receive→forward latency, cluster membership |

## Who the demo is for

The **bank fraud analyst**. That is why the Command Centre (KPIs → investigator →
MuleNet → registry → cases → rules) is the landing destination after sign-in, and why
every analyst action writes an audit log line. The Payment Shield is shown alongside it
so judges see what the customer experiences.

## What are the four demo scenarios?

1. **Safe payment** — verified merchant, valid signed QR, small amount → *Diamond Safe /
   Proceed Safely* (score ≈ 95 when the payment uses the payer's own device and city).
2. **Fake QR attack** — amount inflated on a signed payload → only the signature check
   fails, everything else still passes → *Diamond Alert / Do Not Pay*.
3. **Mule account payment** — beneficiary with 8 senders in, ~76% forwarded out in ~96
   seconds → *Diamond Alert / Do Not Pay*, and the collector ring is visible in MuleNet.
4. **User fraud report** — report from the Safety Centre → new case in the Case Manager →
   analyst investigates, blocks the beneficiary, resolves → audit trail shows every step.

## How does the Diamond Trust Score work?

```
Diamond Trust Score = 100 − (0.45 · RuleRisk + 0.35 · MLRisk + 0.20 · GraphRisk)
```

- 80–100 → **Diamond Safe** (`PROCEED`)
- 55–79 → **Diamond Caution** (`VERIFY_BENEFICIARY` / `EXTRA_AUTH`)
- 0–54 → **Diamond Alert** (`DO_NOT_PAY`)

Two hard stops sit above the arithmetic: a tampered/fake/revoked QR can never score above
25, and a mule-collector beneficiary can never score above 40.

The weights are fixed so a judge can recompute any displayed score by hand from the three
layer values shown next to it.

## How do you know it is explainable?

Every result prints three layers of evidence:

1. **Rule reasons** — e.g. *"Payment originated from a device this account has not used
   before"*, *"Amount is 19.2x higher than this account's normal payment pattern (₹2,500)"*.
2. **Model contributions** — the top contributors among the 12 features, in plain English
   (`explainPrediction()`).
3. **Network observations** — e.g. *"76% of received funds were forwarded within 5
   minutes"*, *"Beneficiary matches the MuleNet money-mule behaviour profile"*.

For a safe payment the panel flips and explains *why it is safe* instead of listing
trivia.

## How good is the model, honestly?

One seeded run of the current build:

| Metric | Value |
| --- | --- |
| ROC-AUC | ≈ 0.94 |
| Recall (fraud catch) | ≈ 0.83 |
| Precision | ≈ 0.65 |
| F1 | ≈ 0.73 |
| Train / test split | 6,400 / 1,600, class-balanced |
| Fraud prevalence | ≈ 12.3% |

**These are synthetic-data numbers.** They show the pipeline, the evaluation and the
explainability work — they are not a claim about real UPI traffic. Precision below recall
is deliberate for a *pre-payment* gate: better to over-flag a few payments for
verification than to let fraud through.

## Why not the Python/scikit-learn stack from the brief?

The brief's algorithms are all present; the runtime is different (this workspace has no
Python process, and the app must run offline). The mapping is explicit in
[`docs/stack_mapping.md`](docs/stack_mapping.md): FastAPI routes → Convex functions with
the same contracts, RandomForest → a logistic risk ensemble trained in-process by
gradient descent (no native binary to ship), NetworkX → a TypeScript graph engine
computing the identical metric set, Streamlit/Plotly → React + Recharts + a custom SVG
network canvas, `qrcode` → `qrcode.react`, `hmac/hashlib` → a dependency-free
SHA-256/HMAC-SHA256 implementation.

## Is any real data involved?

No. 500 customers, 60 merchants, 300 signed QR codes, 8,000 transactions, 120 fraud
cases, 20 planted mule clusters and the whole audit log are generated locally by a
deterministic PRNG. There is no outbound call to any bank, UPI, NPCI or third-party API,
and no paid service is used. The QR signing secret is a public demo constant.

## Could a judge break it?

Things we deliberately handle:

- invalid amount (≤ 0, non-numeric, absurdly large), malformed UPI IDs
- missing QR fields, invalid JSON, unsupported version, unknown merchant, revoked QR,
  expired QR (reported as *Caution*, separately from *tampered*), tampered signature
- model artifact missing → automatic fallback to rule-based scoring with
  `mlAvailable: false`
- database/permission errors → friendly message, never a stack trace
- empty ledger → auto-seed overlay with a retry button
- Reset demo data → deterministic regeneration of every row

## Limitations (stated up front)

1. Synthetic data only; metrics are demo metrics.
2. No integration with UPI/NPCI rails, banks, PSPs or payment gateways.
3. The signing secret is a demo constant, not an HSM/KMS key.
4. The model is trained in-process on the generated ledger — it demonstrates the
   pipeline and explainability, not production performance.
5. Analyst sign-in is demo auth; there is no real customer identity verification.
6. Graph metrics are computed for the seeded window, not for an infinite live stream.

## Roadmap

Streaming scoring on the authorisation path · HSM-backed QR signing with key rotation ·
temporal community detection on a live ledger · analyst-feedback retraining with drift
monitoring · a PSP-side SDK so protection ships without changing the customer's app ·
regional-language explanations.

## BIS / RBI alignment (design intent, not certification)

Pre-authorisation detection rather than dispute-based recovery · standardised signed QR
payloads with version, nonce and expiry plus merchant revocation · immutable-style audit
trail for every analyst action · explainable decisions a customer can be shown ·
fraud-awareness messaging that points users to official bank channels · zero real PII.

---

**"DIAMOND-PROTECT: Every Payment. Protected."**
