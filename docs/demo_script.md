# DIAMOND-PROTECT — live demo script

**Total time: 8 minutes.** Everything below runs offline on synthetic data. No bank, UPI
or NPCI connection is used at any point — say that out loud at the start, it builds
credibility.

## Before you present (2 minutes, do this once)

1. `bun install && bun convex dev --once && bun dev`
2. Open `/auth` → **Continue as Guest** (fastest, no email wait). You land on the Command Centre.
3. Press **Reset demo data** in the header and wait for the progress overlay to finish
   (~12 s). This guarantees an identical, deterministic dataset for the whole demo.
4. Confirm the header chips read **8,000 synthetic transactions** and the model chip shows
   a ROC-AUC value. If either is missing, press Reset once more.
5. Have two tabs open: **`/command`** (analyst) and **`/shield`** (customer).

> If the WiFi drops, nothing breaks. The generator, the model and the database all run
> locally.

---

## 0:00 – 0:45 · Set the frame

Open `/` (landing page).

> "UPI fraud today is handled *after* the money moves — report, dispute, wait. We built
> DIAMOND-PROTECT to move the decision *before* authorisation. Same payment, three
> independent layers, one explainable score, and a clear verdict: proceed, verify, or do
> not pay."

Point at the live ledger card: **8,000 synthetic transactions**, **loss prevented**,
**57 mule accounts**. Say: *"all of this is generated on this machine — no bank data."*

## 0:45 – 2:00 · Analyst overview (the main user)

Click **Enter console** → **Command Centre → Overview**.

Talk through, quickly:

- **High-risk transactions** and **blocked before settlement** — "this is the number that
  matters: money that never left the account."
- **Fraud loss prevented** — the rupee estimate of blocked fraudulent volume.
- **Live feed** — "this is a reactive subscription, not a refresh. Score a payment in the
  other tab later and watch a row appear."
- **Fraud trend (14 days)** and **score distribution** — "the ledger spans all three bands,
  so the dashboard is never empty during a demo."
- **Top suspicious beneficiaries** — click one; it deep-links into MuleNet.

## 2:00 – 3:15 · QR Shield: the fake sticker attack

Go to **Payment Shield → Diamond QR Verify**.

1. Filter to **Active**, pick a QR. Show the payload: merchant, VPA, amount, nonce, version, signature.
2. Press **Verify QR** → green **Verified QR**, 9/9 checks with the HMAC signature passing.
3. Now attack it: choose **Inflate the amount** in *Simulate a QR attack* → **Tamper this QR**
   → **Verify QR** again.
   - Red **Fake / Tampered QR**, *"QR integrity failed. Possible tampering or fake QR. Do not pay."*
   - Scroll the checklist: merchant identity still matches, payload is still readable —
     **the signature check is the one that fails**, exactly like a reprinted sticker whose
     payload was edited after signing.

> Say: *"A printed QR is just a bitmap. We don't trust the sticker, we verify the signed
> payload."*

Optionally try **Forge the signature** and **Backdate the expiry** (that one comes back as
**Caution**, not fake — expiry is separate from tampering, deliberately).

## 3:15 – 4:30 · Mule account payment + MuleNet

Tab 2 → **Payment Shield → Pay & Score**.

1. Keep the prefilled payer, press **Load mule beneficiary** (or click a red *mule suspect* chip).
2. Amount is prefilled to ₹48,000. Press **Check payment safety**.
3. Result: **Diamond Alert**, score in the low single digits, **Do Not Pay**, and five plain-English reasons:
   - beneficiary matches the MuleNet collector profile
   - beneficiary was added seconds before the payment
   - ~76% of received funds were forwarded within minutes
   - amount is 19x the account's normal pattern
   - account is only ~26 days old
4. Point at **Score composition**: rule, ML and graph contributions with the arithmetic shown.
5. Expand **Model feature snapshot** — "the exact 12 features that scored this payment."
6. Click **View in MuleNet** (or go to **Command Centre → MuleNet Graph**).
   - The graph shows isolated fraud clusters, not one hairball: red **mule collectors** in a ring,
     amber **suspicious**, light-blue **cluster periphery**.
   - Hover a node to isolate its neighbourhood; node size is volume, edge width is amount.
   - Click the red collector → the investigation panel: in-degree 8, out-degree 4,
     outflow ratio 76%, receive→forward latency ~96 s, cluster reach 16 accounts.
   - Press **Block account** → confirmation, and the node turns black.
   - Scroll the **Top suspicious clusters** list: 12 clusters with member counts and values.

> Say: *"This is the profile the brief describes — in-degree ≥ 6, out-degree ≥ 4, outflow
> ratio ≥ 0.75, latency ≤ 300 seconds, and at least two other suspicious accounts
> connected. The generator plants that ring, and the graph engine rediscovers it."*

## 4:30 – 5:30 · Scenario 1: the safe payment

Back to **Pay & Score**. Press **Reset demo data** first if you tampered with QRs (10 s).

- Open **Preloaded demo scenarios → Scenario 1 · Safe Payment → Open**.
- Or score manually: verified merchant + small amount + a normal device/location path.
- Show **Diamond Safe / Proceed Safely**, and the reasons panel now explains *why it is safe*:
  rules evaluated and passed, QR verified, beneficiary not in any mule cluster, behaviour
  matches baseline.
- Note the contrast: the same three layers, a completely different verdict and a completely
  different explanation. That contrast is the product.

## 5:30 – 6:30 · Scenario 4: user report → analyst action → audit trail

1. **Payment Shield → Diamond Safety Centre**. Read one awareness card aloud
   (*"Receiving money never needs a QR code"*).
2. Scroll to **Report a fraudulent transaction**, pick any recent transaction, describe what
   happened, **Submit fraud report**.
3. Click **Open CASE-xxxx in the Case Manager**.
4. In the Case Manager: the case is **NEW**, priority derived from the trust score.
   - **Start investigating** → status moves, timeline entry added.
   - **Block beneficiary** → beneficiary blocked *and* the case escalates automatically.
   - Add a note + **Assign case**, then **Resolve case**.
5. Scroll to **Audit trail** — every action with actor, timestamp and detail. Open
   **Command Centre → Transaction Investigator → investigate the same transaction** and show
   its audit trail too. Nothing in this prototype happens without a log line.

## 6:30 – 7:15 · Rule Control Panel: prove the tuning is live

Go to **Command Centre → Rule Control Panel**.

1. In **Scoring sandbox**, press **Run test payment (not committed)** — note the score.
2. Drag **Block threshold** up to ~85 or raise the **High-value threshold**. Press **Save
   configuration**.
3. Press **Run test payment** again → the score and decision change, because the new
   thresholds are stored and read by every subsequent scoring call (including the customer
   shield).
4. Restore defaults, or press **Reset demo data** at the end to return to a pristine ledger.

> Say: *"Scoring isn't hardcoded — the analyst can tune the gate and see the effect
> immediately."*

## 7:15 – 8:00 · Close

Return to **Overview**. Point at **Fraud loss prevented** and **Suspected mule accounts**,
then finish on the landing page's closing panel.

> "DIAMOND-PROTECT doesn't report fraud after the fact — it protects the payment before it
> happens. Three layers, one explainable score, and a verdict a customer can act on."

> **"DIAMOND-PROTECT: Every Payment. Protected."**

---

## Recovery playbook (if something goes wrong)

| Symptom | Fix |
| --- | --- |
| Preview is blank | Press **Reset demo data**, or reload. The app auto-seeds an empty database on first load. |
| "Loading…" hangs | The seed overlay is still running (~12 s). Wait, or retry from the overlay button. |
| A page shows "data unavailable" | The query returned an error; reload the page. Nothing is corrupted — the dataset is regenerated in one click. |
| Numbers look odd after a tamper test | **Reset demo data** restores the deterministic dataset exactly. |
| Model chip says "no model loaded" | Scoring falls back to rules + heuristic, so the demo still runs. Reset to restore the artifact. |
