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

### 1) Sync cadence reduced to 4x/day

- File: `.github/workflows/sync.yml`
- Change: cron moved from hourly to every 6 hours.
- Before: `7 * * * *` (24 runs/day)
- Now: `7 */6 * * *` (4 runs/day)

Expected effect:
- Lower GitHub Actions minutes.
- Fewer auto-commits and potentially fewer downstream deployment triggers.

### 2) Map tile usage reduced by default

- File: `index.html`
- Changes:
  - Removed hardcoded Stadia API key from client bundle.
  - Kept OpenStreetMap as default base map.
  - Made Stadia watercolor optional in layer control (only shown if key is set).
  - Made CARTO labels optional (not auto-enabled).
  - Reduced default map `maxZoom` to 19.

Expected effect:
- Lower paid tile requests by default.
- Reduced chance of exposed-key abuse from shipped client code.

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
- `SYNC_MAX_IMAGE_BYTES=52428800` (50 MB)

Expected effect:
- Prevent runaway sync jobs from slow/large external media.
- Make sync runtime and bandwidth costs more predictable.

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

## Current behavior (what to expect)

- **Only some images in `public/media`:** The sync script localizes images up to the per-run limits (count, bytes, timeout). Images that hit limits or fail to download keep their **remote URLs** in the GeoJSON. So you may see e.g. 10–20 files in `public/media` while the map references more images—the rest load from the original URLs.
- **Users always see images when they click:** Popups use `<img src="...">`. If the image was localized, `src` points to `./public/media/...`; otherwise it points to the remote URL. Either way, the image displays. No extra cost or storage for the remote ones.
- **No more duplicate explosion:** Content-hash naming plus pruning means the same image is never stored multiple times, and unreferenced files are removed each sync. Storage and cost stay bounded.

## KML sync setup

- **KML_URL** is a **GitHub Actions** secret (repo → Settings → Secrets and variables → Actions), not a Vercel env var.
- Format: `https://www.google.com/maps/d/kml?mid=YOUR_MAP_ID&forcekml=1`. Get `YOUR_MAP_ID` from your My Maps viewer URL (`mid=...`).
- After changing the secret, run the workflow once manually: Actions → "Sync My Maps KML to GeoJSON" → Run workflow. Then `git pull` from the repo root to get the updated `public/data/art.geojson` and `public/media`.

## One-off media prune script

- `scripts/prune-media-from-geojson.mjs` removes files in `public/media` that are not referenced in `public/data/art.geojson`. Run with: `node scripts/prune-media-from-geojson.mjs`. The main sync already runs this logic each time; use the script only if you need to prune without a full sync.

## Still recommended next

1. Rotate and restrict any existing Stadia API key in Stadia dashboard.
   - Restrict by site/domain referrer.
   - Set strict usage limits/alerts.

2. Verify Vercel budget controls are strict.
   - Keep `Pause Production Deployments` enabled on budget exceed.
   - Set On-Demand budget conservatively (or `0` for no overage).

3. Add monthly spend review checkpoints.
   - Vercel bandwidth/requests.
   - GitHub Actions minutes.
   - Stadia tile requests by referrer.

## Quick rollback notes

- To restore previous sync cadence, edit cron in `.github/workflows/sync.yml`.
- To re-enable default labels, add `.addTo(map)` for `labelsLayer` in `index.html`.
- To use Stadia watercolor layer, set a valid `STADIA_KEY` in `index.html` and keep it restricted on provider side.
- To disable new sync pruning safeguards, set `SYNC_PRUNE_MEDIA=false` and/or `SYNC_STRIP_UNUSED_PROPERTIES=false`.
