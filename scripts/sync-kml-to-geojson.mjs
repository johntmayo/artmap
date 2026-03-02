import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DOMParser } from "xmldom";
import { kml } from "@tmcw/togeojson";

const KML_URL = process.env.KML_URL;
const OUT_PATH = path.join("public", "data", "art.geojson");
const MEDIA_DIR = path.join("public", "media");
const IMG_SRC_RE = /(<img\b[^>]*\bsrc=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi;
const LOCAL_MEDIA_SRC_RE = /(?:\.\/)?public\/media\/([^"'?#\s>]+)/gi;
const FETCH_TIMEOUT_MS = Number(process.env.SYNC_FETCH_TIMEOUT_MS || 12000);
const MAX_IMAGE_DOWNLOADS = Number(process.env.SYNC_MAX_IMAGES || 60);
const MAX_IMAGE_BYTES = Number(process.env.SYNC_MAX_IMAGE_BYTES || 50 * 1024 * 1024);
const SYNC_PRUNE_MEDIA = process.env.SYNC_PRUNE_MEDIA !== "false";
const SYNC_STRIP_UNUSED_PROPERTIES = process.env.SYNC_STRIP_UNUSED_PROPERTIES !== "false";
const KEPT_PROPERTY_KEYS = ["name", "title", "notes", "description", "icon-color", "styleUrl"];

function ensureKmlUrl(url) {
  if (!url) throw new Error("Missing KML_URL env var.");
  if (!/^https?:\/\//i.test(url)) throw new Error("KML_URL must be an http(s) URL.");
  return url;
}

async function fetchText(url) {
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "my-pretty-art-map-sync"
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch KML: ${res.status} ${res.statusText}`);
  return await res.text();
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function geojsonClean(gj) {
  for (const f of gj.features ?? []) {
    f.properties = f.properties ?? {};
    f.properties.title = f.properties.title || f.properties.name || "";
    f.properties.notes = f.properties.notes || f.properties.description || "";
  }
  return gj;
}

function trimFeatureProperties(gj) {
  let removedPropertyCount = 0;
  for (const f of gj.features ?? []) {
    const source = f.properties ?? {};
    const next = {};
    for (const key of KEPT_PROPERTY_KEYS) {
      if (Object.hasOwn(source, key)) next[key] = source[key];
    }
    removedPropertyCount += Math.max(0, Object.keys(source).length - Object.keys(next).length);
    f.properties = next;
  }
  return removedPropertyCount;
}

function hashBytes(bytes) {
  return crypto.createHash("sha1").update(bytes).digest("hex");
}

function extensionFromContentType(contentType) {
  const t = String(contentType || "").toLowerCase();
  if (t.includes("image/jpeg")) return ".jpg";
  if (t.includes("image/png")) return ".png";
  if (t.includes("image/webp")) return ".webp";
  if (t.includes("image/gif")) return ".gif";
  if (t.includes("image/avif")) return ".avif";
  if (t.includes("image/svg+xml")) return ".svg";
  return "";
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const m = pathname.match(/\.(jpg|jpeg|png|webp|gif|avif|svg)$/i);
    if (!m) return "";
    const ext = m[1].toLowerCase();
    return ext === "jpeg" ? ".jpg" : `.${ext}`;
  } catch {
    return "";
  }
}

async function downloadImageToLocal(url, cache, budget) {
  if (cache.has(url)) return cache.get(url);
  if (budget.downloadedCount >= MAX_IMAGE_DOWNLOADS) {
    console.warn(`Image limit reached (${MAX_IMAGE_DOWNLOADS}); keeping remote URL: ${url}`);
    return url;
  }

  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "my-pretty-art-map-sync",
      "Accept": "image/*,*/*;q=0.8",
      "Referer": "https://www.google.com/maps/d/"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status} ${res.statusText} (${url})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  if (budget.totalBytes + bytes.length > MAX_IMAGE_BYTES) {
    console.warn(`Image byte budget reached (${MAX_IMAGE_BYTES}); keeping remote URL: ${url}`);
    return url;
  }

  const ext =
    extensionFromContentType(res.headers.get("content-type")) ||
    extensionFromUrl(url) ||
    ".jpg";

  // Name localized assets by content hash, not URL hash.
  // Some upstream image URLs are ephemeral, which can otherwise create infinite duplicates.
  const fileName = `${hashBytes(bytes)}${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  const publicPath = `./public/media/${fileName}`;

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, bytes);
  }

  budget.downloadedCount += 1;
  budget.totalBytes += bytes.length;
  cache.set(url, publicPath);
  return publicPath;
}

async function localizeImageUrlsInHtml(html, cache, budget) {
  if (!html || typeof html !== "string") return html;

  let out = "";
  let cursor = 0;

  for (const match of html.matchAll(IMG_SRC_RE)) {
    const full = match[0];
    const prefix = match[1];
    const src = match[2];
    const suffix = match[3];
    const start = match.index ?? 0;

    out += html.slice(cursor, start);

    let nextSrc = src;
    try {
      nextSrc = await downloadImageToLocal(src, cache, budget);
    } catch (err) {
      console.warn(`Image localization failed, keeping remote URL: ${src}`);
      console.warn(String(err));
    }

    out += `${prefix}${nextSrc}${suffix}`;
    cursor = start + full.length;
  }

  out += html.slice(cursor);
  return out;
}

async function localizeFeatureImages(gj) {
  const cache = new Map();
  const budget = { downloadedCount: 0, totalBytes: 0 };

  for (const f of gj.features ?? []) {
    const p = (f.properties = f.properties ?? {});

    for (const key of ["notes", "description"]) {
      const val = p[key];
      if (typeof val === "string") {
        p[key] = await localizeImageUrlsInHtml(val, cache, budget);
      } else if (val && typeof val === "object" && typeof val.value === "string") {
        val.value = await localizeImageUrlsInHtml(val.value, cache, budget);
      }
    }
  }

  return { geojson: gj, localizedCount: cache.size, localizedBytes: budget.totalBytes };
}

function collectReferencedMediaFiles(gj) {
  const keep = new Set();

  const collectFromHtml = (html) => {
    if (typeof html !== "string") return;
    for (const match of html.matchAll(LOCAL_MEDIA_SRC_RE)) {
      const fileName = match[1];
      if (fileName) keep.add(fileName);
    }
  };

  for (const f of gj.features ?? []) {
    const p = f.properties ?? {};
    for (const key of ["notes", "description"]) {
      const val = p[key];
      if (typeof val === "string") {
        collectFromHtml(val);
      } else if (val && typeof val === "object" && typeof val.value === "string") {
        collectFromHtml(val.value);
      }
    }
  }

  return keep;
}

async function pruneUnusedMediaFiles(referencedFiles) {
  let removed = 0;
  let inspected = 0;
  let entries = [];

  try {
    entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") return { removed, inspected };
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    inspected += 1;
    if (referencedFiles.has(entry.name)) continue;
    await fs.unlink(path.join(MEDIA_DIR, entry.name));
    removed += 1;
  }

  return { removed, inspected };
}

async function main() {
  const url = ensureKmlUrl(KML_URL);
  const kmlText = await fetchText(url);

  const doc = new DOMParser().parseFromString(kmlText, "text/xml");
  const cleaned = geojsonClean(kml(doc));
  const { geojson, localizedCount, localizedBytes } = await localizeFeatureImages(cleaned);
  const removedPropertyCount = SYNC_STRIP_UNUSED_PROPERTIES ? trimFeatureProperties(geojson) : 0;
  const referencedMediaFiles = collectReferencedMediaFiles(geojson);
  const { removed: removedMediaCount, inspected: inspectedMediaCount } = SYNC_PRUNE_MEDIA
    ? await pruneUnusedMediaFiles(referencedMediaFiles)
    : { removed: 0, inspected: 0 };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(geojson, null, 2), "utf8");

  console.log(`Wrote ${OUT_PATH} with ${geojson.features?.length ?? 0} features.`);
  console.log(`Localized ${localizedCount} image URLs into ${MEDIA_DIR}.`);
  console.log(`Localized image bytes this run: ${localizedBytes}.`);
  console.log(`Removed ${removedPropertyCount} unused feature properties.`);
  console.log(`Pruned ${removedMediaCount}/${inspectedMediaCount} unreferenced files in ${MEDIA_DIR}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
