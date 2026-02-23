import fs from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "xmldom";
import { kml } from "@tmcw/togeojson";

const KML_URL = process.env.KML_URL;
const OUT_PATH = path.join("public", "data", "art.geojson");

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

async function main() {
  const url = ensureKmlUrl(KML_URL);
  const kmlText = await fetchText(url);

  const doc = new DOMParser().parseFromString(kmlText, "text/xml");
  const geojson = geojsonClean(kml(doc));

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(geojson, null, 2), "utf8");

  console.log(`Wrote ${OUT_PATH} with ${geojson.features?.length ?? 0} features.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
