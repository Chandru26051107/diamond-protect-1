# DIAMOND-PROTECT — pitch deck / judge brief

> **Tagline:** Every Payment. Protected.
>
> **One line:** A pre-authorisation protection layer for UPI that verifies the QR, scores
> the behaviour and scores the network *before* the user releases the money.

**Prototype notice:** this is a hackathon prototype built with synthetic data. It does not
connect to UPI, NPCI, banks, payment gateways or real financial systems. All metrics quoted
below are measured on synthetic data and are not production accuracy claims.

---

## Slide 1 · The problem (30 seconds)

UPI fraud has moved upstream of the payment. The user is deceived *before* they authorise:

1. **Fake and tampered QR stickers** — a reprinted merchant sticker with an edited amount or
   a substituted VPA. The payload looks normal. It is not.
2. **Merchant impersonation / payment redirection** — look-alike shop names and VPAs.
3. **New-beneficiary fraud** — the payee is added seconds before the transfer, usually during
   an urgent phone call.
4. **Money-mule networks** — recruited accounts collect from many victims and forward most of
   it within minutes.

Today's tooling is **post-payment**: report → dispute → wait. By then the money is two hops
away and the victim carries the loss.

**The gap: nobody scores the payment before authorisation.**

## Slide 2 · The solution

DIAMOND-PROTECT sits in front of the authorisation step and produces one decision, backed by
three independent layers and a full explanation:

```
Diamond Trust Score = 100 − (0.45 · RuleRisk + 0.35 · MLRisk + 0.20 · GraphRisk)

80–100  DIAMOND SAFE     → Proceed safely
55–79   DIAMOND CAUTION  → Verify before you pay
0–54    DIAMOND ALERT    → Do not pay
```

| Layer | Question it answers | How |
| --- | --- | --- |
| **QR Shield** | Is this merchant real, and is this payload untouched? | HMAC-SHA256 over canonical JSON: signature, merchant identity, VPA, amount, version, expiry, revocation → a 9-check verdict |
| **Rule + ML engine** | Does this payment look like this user? | 15 deterministic rules + an in-app trained classifier over 12 behavioural features with class balancing |
| **MuleNet** | What network is the money about to enter? | Directed transaction graph: degree, inflow/outflow ratio, unique counterparties, receive→forward latency, clustering, community membership, mule cluster detection |

Hard stops sit above the arithmetic: an invalid signature, a revoked QR or a blocked
beneficiary overrides a good score.

## Slide 3 · Why it is not a black box

Every score prints three things a judge (or an investigator) can audit:

1. **The rules that fired**, in plain English — *"beneficiary was added 42 seconds before
   payment"*, *"QR merchant name does not match the registered merchant"*.
2. **The model's per-feature contribution** for the 12 features it actually used.
3. **The network behaviour observed** — *"beneficiary received funds from 11 accounts in 8
   minutes"*, *"76% of received funds were forwarded within minutes"*.

Explainability is the product, not a debug view: a bank cannot block a payment on a number it
cannot justify to the customer.

## Slide 4 · The live proof (what the demo shows)

| Scenario | Expected verdict | Where you see it |
| --- | --- | --- |
| **1 · Safe payment** — verified merchant, valid signed QR, small amount | Diamond Safe / **Proceed safely** | Payment Shield → Pay & Score |
| **2 · Fake QR attack** — reprinted sticker, edited amount | Diamond Alert / **Do Not Pay** | QR Verify → simulate tampering → signature check fails |
| **3 · Mule account** — 8 senders in, 76% forwarded out in ~96 s | Diamond Alert / **Do Not Pay** | MuleNet graph, collector ring highlighted |
| **4 · User report** — victim reports, analyst acts | Case NEW → investigating → escalated → resolved | Safety Centre → Case Manager → audit trail |

Backing the demo: **8,000 synthetic transactions** (~12% fraudulent), **500 customers**,
**60 merchants**, **300 signed QR codes**, **120 fraud cases**, **~20 mule clusters**, a
14-day fraud trend, and a regulatory-style **audit log** where every analyst action is
recorded.

## Slide 5 · The primary user is a bank fraud analyst

That is what the console is built around:

- **Overview** — high-risk count, blocked-before-settlement, fraud loss prevented, average
  trust score, open cases, verified merchants, suspected mule accounts, live scored feed,
  fraud trend, score distribution, top suspicious beneficiaries.
- **Transaction Investigator** — filter by date, amount, category, decision, QR status,
  merchant, beneficiary, label; open a transaction to see the same explanation the customer
  gets, plus rule/ML/graph breakdown and its audit trail.
- **MuleNet Graph** — interactive network with cluster and risk filters, account detail
  (in/out degree, received/sent, outflow ratio, latency, cluster reach) and one-click
  **clear / review / block**.
- **Merchant QR Registry** — register merchants, mint signed QRs, revoke them, simulate
  tampering, and see status **active / expired / revoked / tampered**.
- **Fraud Case Manager** — statuses NEW → INV/ESCALATED → RESOLVED / FALSE POSITIVE,
  assignment, notes, block beneficiary, timeline and audit trail.
- **Rule Control Panel** — tune thresholds and toggles, then prove the change with a scoring
  sandbox; plus Reset demo data.

## Slide 6 · Engineering credibility

- **Deterministic synthetic generator** — the same demo story every single run; one click to
  regenerate, always offline, no paid APIs, no bank credentials.
- **Honest ML reporting** — train/test split, class balancing, confusion matrix, precision,
  recall, F1, ROC-AUC and feature importance, labelled as synthetic (the reference run lands
  around ROC-AUC ≈ 0.94, recall ≈ 0.83 at ~12% fraud prevalence).
- **Graceful degradation** — validate amount and VPA, handle missing QR fields, distinguish
  expired from tampered, unknown merchants, revoked QRs and model-load failure (falls back to
  rule-based scoring). Friendly error states, never a stack trace.
- **Auditability** — every report, assignment, status change, block and settings change lands
  in an audit log with actor, timestamp and detail.

## Slide 7 · BIS / RBI alignment

| Reference point | How DIAMOND-PROTECT speaks to it |
| --- | --- |
| **BIS guidance on digital payment security** | QR payload integrity via standardised, signed merchant payloads with versioning, nonce and expiry; merchant registry with revocation. |
| **RBI / NPCI fraud-prevention posture** | Detection and prevention *before* authorisation rather than dispute-based recovery; beneficiary risk checks; mule-account identification. |
| **Digital Payments Security Controls / audit expectations** | Immutable-style audit trail for every analyst action, rule configuration versioning, and explainable decisions that can be shown to a customer or auditor. |
| **Consumer protection** | Plain-language reasons, a concrete recommended action, in-app fraud awareness, and an explicit "use official bank channels" direction for real incidents. |
| **Data protection by design** | Zero real PII; synthetic data only; no outbound calls to banks, UPI or NPCI. |

*(Alignment is stated as design intent for a prototype. It is not a certification,
endorsement or compliance claim.)*

## Slide 8 · Honest limitations

- Synthetic data only — metrics are demo metrics, not production accuracy.
- The QR signing secret is a public demo constant, not a production key or HSM.
- The model is trained in-process on the generated ledger; it is a demonstration of pipeline
  and explainability, not a production model.
- No integration with real UPI/NPCI rails, banks or gateways.
- No authentication of a real customer identity; the analyst session is demo auth.

## Slide 9 · Roadmap

1. Real feature store + streaming scoring on the authorisation path.
2. HSM/KMS-backed QR signing with key rotation and merchant onboarding at scale.
3. Graph analytics on a live streaming ledger with temporal community detection.
4. Feedback loop: analyst decisions retrain the model with drift monitoring.
5. Customer-side SDK / PSP plugin, so protection ships without changing the payment app.
6. Regional-language explanations and accessibility review.

## Slide 10 · Close

Three layers. One explainable score. A verdict a customer can act on, and a console an analyst
can defend.

> **"DIAMOND-PROTECT: Every Payment. Protected."**
