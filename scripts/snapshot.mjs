/**
 * Generuje dzienny snapshot ofert: data/snapshots/YYYY-MM-DD.json.
 * Źródło: ASARI_DATA_DIR (domyślnie ../Strona-Dan-Dom/asari-export).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCurrentOffers } from "../lib/asari-reader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const dir =
  process.env.ASARI_DATA_DIR ||
  path.resolve(ROOT, "..", "Strona-Dan-Dom", "asari-export");

if (!fs.existsSync(dir)) {
  console.error(`Brak folderu Asari: ${dir}`);
  console.error("Ustaw ASARI_DATA_DIR albo sklonuj Strona-Dan-Dom obok tego repo.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const offers = loadCurrentOffers(dir);

const snapshotsDir = path.join(ROOT, "data", "snapshots");
fs.mkdirSync(snapshotsDir, { recursive: true });

const outPath = path.join(snapshotsDir, `${today}.json`);
const payload = {
  date: today,
  generatedAt: new Date().toISOString(),
  source: dir,
  offerCount: offers.length,
  offers,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`Snapshot ${today}: ${offers.length} ofert → ${path.relative(ROOT, outPath)}`);
