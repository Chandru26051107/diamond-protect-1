# Stack mapping — brief ↔ shipped

The brief specifies a Python/FastAPI/Streamlit stack running offline in a local
workspace. This repository runs in a browser-runtime workspace with no Python runtime, so
the *algorithms, contracts and UI surfaces* were kept 1:1 and the *implementation language*
was swapped for what this runtime supports. Nothing in the brief was dropped.

**Prototype notice:** synthetic data only. No connection to UPI, NPCI, banks or real
financial systems.

## 1. API endpoints

| Brief (FastAPI) | Shipped (Convex function) | File |
| --- | --- | --- |
| `POST /diamond/score-transaction` | `scoreTransaction` (mutation) | `src/convex/diamond.ts` |
| `POST /diamond/generate-qr` | `generateQr` | `src/convex/diamond.ts` |
| `POST /diamond/verify-qr` | `verifyQr` | `src/convex/diamond.ts` |
| `POST /diamond/report-fraud` | `reportFraud` | `src/convex/diamond.ts` |
| `GET /diamond/transactions` | `transactions`, `transaction` | `src/convex/diamond.ts` |
| `GET /diamond/admin/metrics` | `metrics`, `overviewExtras` | `src/convex/commandCentre.ts` |
| `GET /diamond/admin/mulenet` | `mulenet`, `accountDetail` | `src/convex/commandCentre.ts` |
| `GET /diamond/admin/cases` | `cases` | `src/convex/commandCentre.ts` |
| `PATCH /diamond/admin/cases/{case_id}` | `updateCase` | `src/convex/commandCentre.ts` |
| `GET /health` | `health` | `src/convex/diamond.ts` |

Same request/response shape (validated args, structured JSON results, friendly `error`
strings, `ok` flags), plus the extra endpoints the console needs:

| Capability | Function |
| --- | --- |
| QR tamper simulation / revocation | `tamperQr`, `revokeQr`, `signPayloadPreview` |
| Merchant registry | `merchants`, `registerMerchant` |
| Rule configuration | `settings`, `updateSettings` |
| Analyst account action | `setAccountStatus` |
| Live feed / suggestions / scenarios | `metrics.feed`, `payerSuggestions`, `demoScenarios` |
| Audit trail | `auditLogs` |
| Seeding | `seedDemoData` (+ batch helpers) in `src/convex/demoSeed.ts` |

`GET /health` returns exactly what the brief asks for: API version, counts, fraud rate,
model availability + ROC-AUC, seed state, and the synthetic-data disclaimer.

## 2. Database

| Brief (SQLite + SQLAlchemy) | Shipped |
| --- | --- |
| `users` | `accounts` (kind `USER`, plus graph metrics, mule status) — `src/convex/schema.ts` |
| `merchants` | `merchants` |
| `transactions` | `transactions` (rule/ml/graph scores, trust score, decision, explanation, label) |
| `qr_codes` | `qrCodes` (payload, signature, status, tamper state) |
| `fraud_cases` | `fraudCases` (status, assignee, notes, timeline) |
| `audit_logs` | `auditLogs` (actor, action, entity, timestamp, details) |
| `data/diamond_protect.db` | The Convex deployment database; one click on **Reset demo data** recreates every row deterministically |
| `data/sample_transactions.csv` | The same rows browsed live in **Transaction History** and the **Transaction Investigator** (search, filters, CSV-style columns) |

## 3. Machine learning

| Brief (scikit-learn) | Shipped |
| --- | --- |
| `ml/train_diamond_model.py` | `trainDiamondModel()` in `src/convex/lib/diamondMl.ts`, run inside the seed |
| RandomForestClassifier | **Logistic risk ensemble trained by gradient descent** — no native binary to ship in an offline browser runtime, same feature contract, same evaluation |
| 12 features | identical: `amount`, `hour_of_day`, `beneficiary_account_age_days`, `previous_txns_to_beneficiary`, `is_new_beneficiary`, `device_change_flag`, `location_change_flag`, `qr_valid`, `qr_merchant_match`, `sender_count_last_10_min`, `outflow_ratio_5_min`, `previous_fraud_reports` |
| `ml/diamond_model.pkl` | `modelArtifacts` row (weights, bias, feature order) |
| `ml/feature_config.json` | `FEATURES` in `src/convex/lib/types.ts` |
| `ml/metrics.json` | `modelArtifacts.metrics` — accuracy, precision, recall, F1, ROC-AUC, confusion matrix, feature importance, train/test sizes |
| `explain_prediction(model, features)` | `explainPrediction()` — top 5 human-readable contributors |
| Failure fallback | if the artifact is missing/corrupt, `loadModel()` returns `null` and scoring falls back to rules + heuristics (`mlAvailable: false`) |

## 4. Graph analysis

| Brief (NetworkX) | Shipped |
| --- | --- |
| `DiGraph` from transactions | `src/convex/lib/mulenet.ts` (edges built in `ledger.ts`) |
| degree, in/out, total received/sent, outflow ratio, unique senders/receivers, average receive→send time, clustering, community | identical metric set on every account node |
| Mule heuristic | identical: `in_degree ≥ 6 AND out_degree ≥ 4 AND outflow_ratio ≥ 0.75 AND avg_receive→send ≤ 300s AND ≥ 2 suspicious neighbours` |
| `{nodes, edges}` payload for Plotly | `{nodes, edges, clusters, communities, legend, totals}` consumed by the React network canvas |
| top 10 suspicious clusters | `clusters` with `clusterId`, `memberCount`, `totalValue`, `avgRisk`, `muleAccounts` |

## 5. Dashboard

| Brief (Streamlit + Plotly) | Shipped |
| --- | --- |
| `1_User_Payment_Shield` | `src/pages/shield/PayShield.tsx` (`/shield`) |
| `2_Diamond_QR_Verify` | `src/pages/shield/QrVerify.tsx` (`/shield/qr`) |
| `3_Transaction_History` | `src/pages/shield/History.tsx` (`/shield/history`) |
| `4_Diamond_Command_Centre` | `src/pages/command/Overview.tsx` (`/command`) |
| `5_Transaction_Investigator` | `src/pages/command/Investigator.tsx` (`/command/investigator`) |
| `6_MuleNet_Graph` | `src/pages/command/MuleNetGraph.tsx` (`/command/mulenet`) |
| `7_Merchant_QR_Registry` | `src/pages/command/MerchantRegistry.tsx` (`/command/merchants`) |
| `8_Fraud_Case_Manager` | `src/pages/command/CaseManager.tsx` (`/command/cases`) |
| `9_Settings` | `src/pages/command/RuleControl.tsx` (`/command/rules`) |
| Plotly charts | Recharts (trend, distribution, KPI sparklines) + a custom SVG network canvas for MuleNet |
| `requests` | Convex reactive queries — no HTTP client, no network polling |
| `dashboard/Diamond_Protect.py` | `src/main.tsx` router + `src/components/dp/Shell.tsx` (nav, seeding, prototype banner) |

## 6. QR security

| Brief (qrcode · hashlib · hmac · json · base64) | Shipped |
| --- | --- |
| `qrcode` | `qrcode.react` (rendered QR images in the registry and the verify screen) |
| `hashlib` / `hmac` | dependency-free SHA-256 + HMAC-SHA256 (RFC 2104) in `src/convex/lib/crypto.ts` |
| `generate_merchant_qr()` | `generateQr` endpoint, which builds the payload and calls `buildSignedPayload()` |
| `verify_qr_payload()` | `verifyQrPayload()` → `verifyQr` endpoint (9 checks) |
| `simulate_qr_tampering()` | `simulateQrTampering()` → `tamperQr` endpoint (6 modes) |

## 7. Project files

| Brief | Shipped |
| --- | --- |
| `requirements.txt` | `package.json` |
| `docs/architecture.png` | `docs/architecture.svg` (crisp at any zoom, diff-able) |
| `docs/pitch_deck.md` | `docs/pitch_deck.md` |
| `docs/demo_script.md` | `docs/demo_script.md` |
| `README.md` | `README.md` |
| `.gitignore` | `.gitignore` |
| — | `docs/judge_explanation.md`, `docs/stack_mapping.md` (added) |
