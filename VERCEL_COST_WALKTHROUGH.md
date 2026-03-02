# Vercel cost controls – step-by-step walkthrough

This walkthrough covers **everything** to do on Vercel (and a quick note on plan) so you reduce the risk of overspend. Use it with your screenshots to confirm each step.

---

## 1. Confirm your plan (Spend Management needs Pro)

- **Spend Management** (budget limit + pause deployments) is only available on **Pro** teams.
- **Hobby** accounts do not get Spend Management; you can still watch Usage and set usage notifications if available.
- In Vercel: click the **team name** (top left). Next to it you should see **Hobby** or **Pro** (or Enterprise).
- If you’re on Hobby and want hard spending caps, you’d need to upgrade to Pro for Spend Management. If you’re on Pro, continue below.

---

## 2. Where to find billing and spend settings

1. Open [Vercel Dashboard](https://vercel.com/dashboard).
2. Select the **team** that owns the art map project (team switcher / top left).
3. In the left sidebar: **Settings**.
4. In Settings, open **Billing**.

You should see:
- Plan (Pro/Hobby)
- Invoice / payment method
- **Spend Management** (or similar) section

*(Screenshot 1: Team → Settings → Billing – so we see the same page.)*

---

## 3. Enable and set Spend Management (Pro only)

Goal: set a **spend amount** (USD per billing cycle) and **enable “Pause production deployment”** so production stops when you hit that amount.

1. In **Settings → Billing**, find **Spend Management**.
2. **Turn Spend Management ON** (toggle enabled).
3. **Set the spend amount** (e.g. $20 or $50 – whatever you’re comfortable with as a cap).  
   - This applies to **metered usage** that goes over your plan’s included credits (bandwidth, builds, etc.).  
   - It does **not** include fixed monthly costs (seats, add-ons).
4. Under “When spend amount is reached”, **enable “Pause production deployment”** (or equivalent).  
   - Vercel’s docs say this is now default for new budgets, but **verify** it’s enabled so production deployments stop at your limit.
5. Save / confirm (some UIs ask you to type the team name to confirm).

*(Screenshot 2: Spend Management section showing: ON, spend amount, and “Pause production deployment” enabled.)*

Important: **Setting a spend amount alone does not stop usage.** You must explicitly enable “Pause production deployment” (or “Pause all projects”) for that.

---

## 4. Set On-Demand / overage budget (if the option exists)

- Some teams have an **On-Demand** or **Overage** budget: extra spend allowed beyond the base plan.
- To minimize overspend risk: set this **conservatively** (e.g. $0 or a small amount like $10) so you don’t accidentally allow a large overage.
- If you see **On-Demand** or **Overage** in Billing, set it to **0** (no overage) or to a low cap you’re comfortable with.

*(Screenshot 3: Any “On-Demand” / “Overage” / “Additional spend” control, if present.)*

---

## 5. Notifications (optional but recommended)

- In Spend Management (or in **Settings → Notifications**), enable **notifications** at 50%, 75%, and 100% of your spend amount (web + email; SMS at 100% if you want).
- That way you’re warned before production is paused and can adjust if needed.

*(Screenshot 4: Notification thresholds for spend, if you’re setting them.)*

---

## 6. Usage page – what to watch monthly

Your project is **static** (no serverless, no ISR), so the main things that can grow are:

- **Bandwidth** (serving `index.html`, `art.geojson`, and `public/media`). Cache headers in `vercel.json` reduce repeat-visit bandwidth.
- **Builds** (each deploy = one build; sync runs 2×/day, so up to 2 deploys/day when the sync commits).

To review monthly (as in `COST_REDUCTION_PLAN.md`):

1. In the dashboard, open **Usage** in the sidebar.
2. Select the correct **team** and **billing cycle** (e.g. “Current billing period” or “Last 30 days”).
3. Check:
   - **Bandwidth** (and “Top Paths” if you want to see which assets use the most).
   - **Builds** (count and any overage).
4. Optionally filter by **project** to see usage for the art map project only.

*(Screenshot 5: Usage overview for the team/project – so we can align on what “normal” looks like.)*

---

## 7. Checklist summary

Before you consider “Vercel cost controls” done, confirm:

| Step | What to verify |
|------|----------------|
| 1 | You know if you’re on Hobby or Pro (Spend Management = Pro only). |
| 2 | You’ve been to **Settings → Billing** for the right team. |
| 3 | **Spend Management** is **ON** and a **spend amount** (USD) is set. |
| 4 | **“Pause production deployment”** (or “Pause all projects”) is **enabled** when spend amount is reached. |
| 5 | **On-Demand / Overage** budget is set to **0** or a low cap (if that option exists). |
| 6 | Notifications at 50% / 75% / 100% are enabled (optional but recommended). |
| 7 | You know where **Usage** is and will check bandwidth + builds monthly. |

---

## 8. Other “backend” cost items (from COST_REDUCTION_PLAN.md)

- **GitHub Actions**  
  Sync runs 4×/day (`.github/workflows/sync.yml`). Usage is in GitHub → **Settings → Billing** (Actions minutes). No change needed on Vercel for this.

- **Stadia (tile API)**  
  Restrict and set limits in the **Stadia dashboard** (referrer, usage alerts). The map no longer ships a hardcoded key by default; if you add one via env, keep it restricted.

- **Monthly review**  
  Vercel Usage (bandwidth, builds), GitHub Actions minutes, and Stadia usage – quick check each month.

---

**To confirm it won’t “go crazy again”:** Open **Usage**, pick the current billing period, and see whether **Bandwidth** or **Builds** is driving the overage. That tells you the main lever. The repo has been tuned (sync 2×/day, zoom cap 17, cache headers, sync limits, media pruning); the remaining control is turning **Pause production deployments** on when you’re ready (e.g. at the start of the next cycle).

When you share screenshots, we can go through them in order (Billing → Spend Management → Pause deployment → On-Demand → Notifications → Usage) and confirm nothing’s missing or mis-set.
