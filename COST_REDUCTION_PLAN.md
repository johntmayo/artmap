# Cost Reduction Plan

This document captures what was changed to reduce run costs and what to do next.

## Incident note: media duplication root cause

Observed in `public/media`:
- ~4526 PNGs totaling ~16.87 GB
- only ~56 media references currently used in `public/data/art.geojson`

Root cause:
- Earlier sync logic named files by **URL hash**.
- Upstream image URLs can rotate/change (even for same image bytes).
- Each sync therefore saved duplicate copies under new filenames.
- Without pruning in earlier runs, stale copies accumulated rapidly.

## Changes applied now

### 1) Sync cadence reduced (4x/day → 2x/day)

- File: `.github/workflows/sync.yml`
- Change: cron moved from every 6 hours to every 12 hours.
- Before: `7 */6 * * *` (4 runs/day)
- Now: `7 */12 * * *` (2 runs/day)

Expected effect:
- Lower GitHub Actions minutes.
- Fewer auto-commits and fewer Vercel builds (each push = one build).

### 2) Map tile usage reduced by default

- File: `index.html`
- Changes:
  - Removed hardcoded Stadia API key from client bundle.
  - Kept OpenStreetMap as default base map.
  - Made Stadia watercolor optional in layer control (only shown if key is set).
  - Made CARTO labels optional (not auto-enabled).
  - Map zoom capped: `minZoom: 10`, `maxZoom: 17` (was 19); all tile layers use `maxZoom: 17`.

Expected effect:
- Lower paid tile requests by default.
- Reduced chance of exposed-key abuse from shipped client code.

**Update (session 2):** The Stadia watercolor layer was not rendering because `STADIA_KEY` was empty. The key has been restored to `index.html`. The layer now works again. Key should be restricted by domain referrer in the Stadia dashboard to prevent abuse (see "Still recommended next" below).

### 3) Sync image downloads now have budget controls

- File: `scripts/sync-kml-to-geojson.mjs`
- Changes:
  - Added fetch timeout for remote calls.
  - Added image count cap per run.
  - Added total image bytes cap per run.
  - Logs localized byte total per run.

Default limits (overridable via env vars):
- `SYNC_FETCH_TIMEOUT_MS=12000`
- `SYNC_MAX_IMAGES=60`
- `SYNC_MAX_IMAGE_BYTES=52428800` (50 MB, **updated in session 2 — see below**)

Expected effect:
- Prevent runaway sync jobs from slow/large external media.
- Make sync runtime and bandwidth costs more predictable.

**Update (session 2):** Two changes made to `scripts/sync-kml-to-geojson.mjs`:

1. **Image resize before download.** Added `resizeGoogleImageUrl()`, which rewrites `fife=s16383` to `fife=s1280` in the Google image URL before fetching. Google honors this parameter and serves a 1280 px version (~300 KB) instead of the full-resolution poster-size version (~4.5 MB). 1280 px remains visually sharp at the popup gallery's display size (108–220 px tall, ~440 px on retina).

2. **Byte budget raised from 50 MB to 250 MB.** At the original 50 MB limit, only 11 of 42 images were being downloaded (each ~4.5 MB exhausted the budget quickly). At ~300 KB per image, 250 MB covers ~800 images — well past the expected 100–500 pin ceiling.

Side effect of session 2 changes: the 11 already-downloaded full-resolution images will be replaced by smaller versions on the next sync. Their content-hash filenames will change, and the prune step will automatically delete the old large files. The `public/media` folder will shrink considerably.

### 4) GeoJSON and media output is now trimmed per sync

- File: `scripts/sync-kml-to-geojson.mjs`
- Changes:
  - Localized image filenames now use **content hash** (image bytes), not URL hash.
  - Strips non-essential feature properties before writing output.
  - Keeps only: `name`, `title`, `notes`, `description`, `icon-color`, `styleUrl`.
  - Scans feature HTML for `./public/media/...` references.
  - Deletes unreferenced files from `public/media`.
  - Logs how many properties and media files were pruned each run.

Default behavior flags:
- `SYNC_STRIP_UNUSED_PROPERTIES=true` (set `false` to disable)
- `SYNC_PRUNE_MEDIA=true` (set `false` to disable)

Expected effect:
- Stops duplicate media growth caused by rotating source URLs.
- Smaller `public/data/art.geojson`.
- Lower repository and deployment artifact growth over time.
- Reduced hosting bandwidth for static assets.

### 5) Vercel cache headers and zoom cap (latest)

- File: `vercel.json` (new)
  - `Cache-Control` for `/public/data/*`: 1 hour (`max-age=3600`) so repeat visitors don’t re-download GeoJSON every time.
  - `Cache-Control` for `/public/media/*`: 7 days (`max-age=604800`); media filenames are content-hashed so long cache is safe.
- File: `index.html`
  - Map options: `minZoom: 10`, `maxZoom: 17`. OSM, watercolor, and CARTO labels all use `maxZoom: 17` to reduce tile requests (to OSM/CARTO and browser work).

Expected effect:
- Fewer Vercel bandwidth bytes for returning visitors (browser/CDN cache).
- Fewer tile requests at high zoom levels.

## Current behavior (what to expect)

- **All images in `public/media` (after session 2 sync runs):** With the raised byte budget and image resizing, all images should now be downloaded locally on each sync. Images are served by Vercel as static files with correct content types.
- **Remote URLs show broken images:** Google serves My Maps images without a proper `Content-Type` header (`application/octet-stream` instead of `image/jpeg`). Browsers display a broken image icon. Clicking downloads a nameless file; renaming it to `.jpg` reveals a valid image. This is why local hosting is essential — Vercel serves files with correct content types automatically.
- **No more duplicate explosion:** Content-hash naming plus pruning means the same image is never stored multiple times, and unreferenced files are removed each sync. Storage and cost stay bounded.
- **After a sync runs:** Images that were previously remote Google URLs will be re-downloaded locally. The prune step removes old full-resolution files automatically. No manual cleanup needed.

## KML sync setup

- **KML_URL** is a **GitHub Actions** secret (repo → Settings → Secrets and variables → Actions), not a Vercel env var.
- Format: `https://www.google.com/maps/d/kml?mid=YOUR_MAP_ID&forcekml=1`. Get `YOUR_MAP_ID` from your My Maps viewer URL (`mid=...`).
- After changing the secret, run the workflow once manually: Actions → "Sync My Maps KML to GeoJSON" → Run workflow. Then `git pull` from the repo root to get the updated `public/data/art.geojson` and `public/media`.

## One-off media prune script

- `scripts/prune-media-from-geojson.mjs` removes files in `public/media` that are not referenced in `public/data/art.geojson`. Run with: `node scripts/prune-media-from-geojson.mjs`. The main sync already runs this logic each time; use the script only if you need to prune without a full sync.

## What to check in Vercel (so it doesn’t “go crazy again”)

- **Usage tab (Dashboard → Usage):** See whether **Bandwidth** or **Builds** (or both) are driving overage. For this static site, those are the only two that matter. Check “Current billing period” and “Top Paths” if available.
- **Spend Management (Settings → Billing):** Turn **Pause production deployments** **ON** when you’re ready (e.g. at the start of the next cycle, March 20). Until then, the site stays up; after you enable it, the next time you hit the on-demand budget, production will pause instead of overspending again.
- **On-Demand budget:** You already have a cap ($20). Leave “Pause” off until March 20 if you want the site up for this window; then turn “Pause” on so the cap is enforced.

## Still recommended next

1. Rotate and restrict any existing Stadia API key in Stadia dashboard.
   - Restrict by site/domain referrer.
   - Set strict usage limits/alerts.

2. Verify Vercel budget controls are strict.
   - **Enable “Pause production deployments”** when spend amount is reached (do this after this billing window if you want the site up until March 20).
   - On-Demand budget is already set; keep it conservative (or `0` for no overage).

3. Add monthly spend review checkpoints.
   - Vercel Usage (bandwidth, builds).
   - GitHub Actions minutes.
   - Stadia tile requests by referrer.

## Quick rollback notes

- To restore previous sync cadence, edit cron in `.github/workflows/sync.yml` (e.g. `7 */6 * * *` for 4×/day).
- To re-enable default labels, add `.addTo(map)` for `labelsLayer` in `index.html`.
- To raise zoom again, change `minZoom`/`maxZoom` on the map and `maxZoom` on each tile layer in `index.html` (e.g. back to 19).
- To disable Stadia watercolor layer, clear `STADIA_KEY` in `index.html` (set to `""`). Key is currently active; restrict by domain in the Stadia dashboard.
- To disable new sync pruning safeguards, set `SYNC_PRUNE_MEDIA=false` and/or `SYNC_STRIP_UNUSED_PROPERTIES=false`.
- To remove Vercel cache headers, delete or edit `vercel.json`.

---

## Session log

### Session 1 (initial cost-reduction work)
Applied all changes described above: reduced sync cadence, removed Stadia key, added budget controls, switched to content-hash media naming, added pruning, added Vercel cache headers.

### Session 2 (2026-03-03)

**Issue 1 — Watercolor layer not rendering**
- Root cause: `STADIA_KEY` was empty after session 1 changes; the layer silently showed nothing.
- Fix: Restored the Stadia API key to `const STADIA_KEY` in `index.html`.
- Deployment note: GitHub PR merge failed ("We couldn't merge this pull request") due to the automated sync job pushing a new commit to `main` between branch creation and merge attempt. Workaround: manually promoted the Vercel Preview deployment to Production. For subsequent PRs, branch is rebased on latest `main` before pushing to prevent this.

**Issue 2 — Popup images showing as broken**
- Root cause: Google serves My Maps images without a proper `Content-Type` header. Browsers display a broken icon instead of the image. The sync script was already designed to fix this by downloading images locally, but only 11 of 42 images had been downloaded — the 50 MB byte budget was exhausted because Google was serving images at full resolution (~4.5 MB each, via `fife=s16383`).
- Fix 1: Added `resizeGoogleImageUrl()` in `scripts/sync-kml-to-geojson.mjs` to rewrite `fife=s16383` → `fife=s1280` before downloading. Images drop from ~4.5 MB to ~300 KB each.
- Fix 2: Raised `MAX_IMAGE_BYTES` from 50 MB to 250 MB. Covers ~800 images at the new size.
- **Required action:** Manually trigger the sync workflow (GitHub Actions → "Sync My Maps data" → Run workflow) after merging. This will download all 31 previously-skipped images and fix the broken popups.
