# Community Art Map - Developer Handoff

This document explains how this project works today, what problems were solved, and how to safely maintain it in the future.

## What this project is

- A static Leaflet map site that displays community art points sourced from a Google My Maps project.
- Data is synced automatically from My Maps KML into GeoJSON via GitHub Actions.
- The UI includes:
  - watercolor basemap + street label overlay
  - category icons and category filters
  - styled popups with photo gallery + text
  - mobile-focused control layout

## Core file layout

- `index.html`
  - Entire frontend app (Leaflet setup, styles, controls, popup rendering, filtering).
- `scripts/sync-kml-to-geojson.mjs`
  - Sync script that:
    - fetches KML
    - converts KML -> GeoJSON
    - localizes My Maps image URLs into local files
    - rewrites popup `<img src>` URLs to local paths
- `.github/workflows/sync.yml`
  - Hourly + manual Action that runs sync and commits data/media updates.
- `public/data/art.geojson`
  - Current map features (auto-generated, committed).
- `public/media/*`
  - Downloaded popup images from My Maps (auto-generated, committed).

## Data flow (important)

1. GitHub Action runs `npm run sync`.
2. Sync script fetches `KML_URL` from repo secret.
3. KML is converted to GeoJSON (`@tmcw/togeojson` + `xmldom`).
4. Embedded My Maps image URLs are downloaded locally into `public/media/`.
5. Image URLs in notes/description HTML are rewritten to `./public/media/...`.
6. Action commits changes to:
   - `public/data/art.geojson`
   - `public/media/`

This local-media approach was added because direct My Maps hosted images were unreliable in browser popups.

## Runtime/deploy assumptions

- Site is deployed as a static project on Vercel.
- `index.html` is served at root.
- `public/data/art.geojson` is fetched client-side by `index.html`.

## Secrets / keys

- GitHub secret:
  - `KML_URL` -> live network-link KML endpoint from My Maps.
- Stadia key:
  - currently hardcoded in `index.html` as `STADIA_KEY`.
  - **Recommendation:** move to environment/build-time injection and rotate if exposed.

## Known solved pitfalls (history)

- **Push rejections to `main`:**
  - Auto-sync commits can land while a human/developer is pushing UI changes.
  - Safe fix: `git pull --rebase origin main`, resolve, then push.
- **Popup images broken / downloading odd files:**
  - Fixed by localizing image assets in sync pipeline.
- **Huge random popup spacing / extra line breaks:**
  - Fixed by text normalization + cleanup of excess `<br>` and whitespace.
- **Watercolor tile "tearing" (gray holes):**
  - Fixed with OSM fallback under watercolor and transparent error tiles.
- **Mobile layout crowding:**
  - Iterative control layout changes were made for top controls and compact cards.

## Frontend behavior guide

### Map visuals

- Base layer stack:
  - OSM fallback layer (underlay)
  - Stadia watercolor layer (overlay)
  - label overlay layer
- Default attribution strip is disabled.
- Custom "Map credits" pill exists in bottom-left.

### Categories and icons

- Category config is in `index.html` (`CATEGORY_CONFIG`).
- Category assignment is computed by `detectCategory(feature)`.
- Current logic uses:
  - `icon-color` / `styleUrl` in feature props
  - "interactive" keyword and geometry checks

### Popups

- Popups are custom-styled "cards".
- Photos render as a gallery grid.
- Clicking an image opens full-size asset.
- Raw URLs in notes are auto-linkified.
- Text is normalized to prevent odd spacing.

## Mobile behavior

- Zoom `+/-` is disabled.
- Top controls are compact and repositioned for narrow screens.
- Title card is reduced on mobile (subtitle + contribute text hidden).
- Categories panel uses a compact footprint.

## How to run locally

```powershell
npm install
$env:KML_URL="https://www.google.com/maps/d/u/0/kml?forcekml=1&mid=..."
npm run sync
```

Then serve statically (example):

```powershell
npx serve .
```

## How to update map content

You generally do **not** edit `public/data/art.geojson` manually.

- Update source map in Google My Maps.
- Wait for scheduled Action or run workflow manually.
- New features/media will be committed automatically.

## How to update styling/functionality

Most UI changes are in `index.html`.

Common tweak points:

- Title/branding text:
  - `MAP_META` object.
- Category labels/icons/colors:
  - `CATEGORY_CONFIG`.
- Category classification:
  - `detectCategory()`.
- Popup layout/typography:
  - CSS classes starting with `.popup-*`.
- Mobile layout:
  - `@media (max-width: 800px)` section.

## Action workflow notes

- Workflow commits bot updates itself.
- Current workflow stages both GeoJSON and media.
- If no data/media changes, workflow exits without committing.

## Recommended future improvements

1. Move `STADIA_KEY` out of source to env/build injection.
2. Add a tiny test script that validates generated `art.geojson` shape and image references.
3. Split frontend into modular files (`styles.css`, `app.js`) once iteration slows.
4. Add lightweight analytics/events (optional) for filter usage and popup opens.
5. Add an explicit desktop/mobile layout QA checklist before major UI merges.

## Quick maintenance checklist

- [ ] Confirm `KML_URL` secret still valid.
- [ ] Confirm GitHub Action run succeeds.
- [ ] Confirm `public/data/art.geojson` has features.
- [ ] Confirm `public/media/` files exist after sync.
- [ ] Confirm popups display images and notes.
- [ ] Confirm mobile top controls don't overlap on iPhone widths.
- [ ] Confirm credits chip and labels toggle still visible.

