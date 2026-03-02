import fs from "node:fs/promises";
import path from "node:path";

const GEOJSON_PATH = path.join("public", "data", "art.geojson");
const MEDIA_DIR = path.join("public", "media");
const LOCAL_MEDIA_SRC_RE = /(?:\.\/)?public\/media\/([^"'?#\s>]+)/gi;

async function main() {
  const geojsonText = await fs.readFile(GEOJSON_PATH, "utf8");
  const referenced = new Set();
  for (const match of geojsonText.matchAll(LOCAL_MEDIA_SRC_RE)) {
    const fileName = match[1];
    if (fileName) referenced.add(fileName);
  }

  let entries = [];
  try {
    entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.log("No media directory found.");
      return;
    }
    throw err;
  }

  let inspected = 0;
  let kept = 0;
  let removed = 0;
  let removedBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    inspected += 1;
    if (referenced.has(entry.name)) {
      kept += 1;
      continue;
    }

    const fullPath = path.join(MEDIA_DIR, entry.name);
    const stat = await fs.stat(fullPath);
    await fs.unlink(fullPath);
    removed += 1;
    removedBytes += stat.size;
  }

  const removedGb = Math.round((removedBytes / (1024 * 1024 * 1024)) * 100) / 100;
  console.log(
    JSON.stringify(
      {
        references: referenced.size,
        inspected,
        kept,
        removed,
        removedBytes,
        removedGb
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
