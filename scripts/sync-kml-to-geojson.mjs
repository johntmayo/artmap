import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DOMParser } from "xmldom";
import { kml } from "@tmcw/togeojson";

const KML_URL = process.env.KML_URL;
const OUT_PATH = path.join("public", "data", "art.geojson");
const MEDIA_DIR = path.join("public", "media");
const IMG_SRC_RE = /(<img\b[^>]*\bsrc=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi;

function ensureKmlUrl(url) {
  if (!url) throw new Error("Missing KML_URL env var.");
  if (!/^https?:\/\//i.test(url)) throw new Error("KML_URL must be an http(s) URL.");
  return url;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "my-pretty-art-map-sync"
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch KML: ${res.status} ${res.statusText}`);
  return await res.text();
}

function geojsonClean(gj) {
  for (const f of gj.features ?? []) {
    f.properties = f.properties ?? {};
    f.properties.title = f.properties.title || f.properties.name || "";
    f.properties.notes = f.properties.notes || f.properties.description || "";
  }
  return gj;
}

function hashUrl(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
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

async function downloadImageToLocal(url, cache) {
  if (cache.has(url)) return cache.get(url);

  const res = await fetch(url, {
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

  const ext =
    extensionFromContentType(res.headers.get("content-type")) ||
    extensionFromUrl(url) ||
    ".jpg";

  const fileName = `${hashUrl(url)}${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  const publicPath = `./public/media/${fileName}`;

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(filePath, bytes);

  cache.set(url, publicPath);
  return publicPath;
}

async function localizeImageUrlsInHtml(html, cache) {
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
      nextSrc = await downloadImageToLocal(src, cache);
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

  for (const f of gj.features ?? []) {
    const p = (f.properties = f.properties ?? {});

    for (const key of ["notes", "description"]) {
      const val = p[key];
      if (typeof val === "string") {
        p[key] = await localizeImageUrlsInHtml(val, cache);
      } else if (val && typeof val === "object" && typeof val.value === "string") {
        val.value = await localizeImageUrlsInHtml(val.value, cache);
      }
    }
  }

  return { geojson: gj, localizedCount: cache.size };
}

async function main() {
  const url = ensureKmlUrl(KML_URL);
  const kmlText = await fetchText(url);

  const doc = new DOMParser().parseFromString(kmlText, "text/xml");
  const cleaned = geojsonClean(kml(doc));
  const { geojson, localizedCount } = await localizeFeatureImages(cleaned);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(geojson, null, 2), "utf8");

  console.log(`Wrote ${OUT_PATH} with ${geojson.features?.length ?? 0} features.`);
  console.log(`Localized ${localizedCount} image URLs into ${MEDIA_DIR}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
