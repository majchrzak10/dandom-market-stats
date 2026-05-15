/**
 * Generuje dzienny snapshot ofert + wylicza eventy diff vs poprzedni snapshot.
 *
 * Output:
 *   data/snapshots/YYYY-MM-DD.json   — pełny snapshot
 *   data/events/YYYY.jsonl           — append: nowe eventy z dzisiaj (jeden plik per rok)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCurrentOffers } from "../lib/asari-reader.mjs";
import { computeDiff } from "../lib/diff.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const dir =
  process.env.ASARI_DATA_DIR ||
  path.resolve(ROOT, "..", "Strona-Dan-Dom", "asari-export");

if (!fs.existsSync(dir)) {
  console.error(`Brak folderu Asari: ${dir}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const offers = loadCurrentOffers(dir);

const snapshotsDir = path.join(ROOT, "data", "snapshots");
const eventsDir = path.join(ROOT, "data", "events");
fs.mkdirSync(snapshotsDir, { recursive: true });
fs.mkdirSync(eventsDir, { recursive: true });

const currSnapshot = {
  date: today,
  generatedAt: new Date().toISOString(),
  source: dir,
  offerCount: offers.length,
  offers,
};

// Znajdź poprzedni snapshot (chronologicznie)
const existingSnapshots = fs
  .readdirSync(snapshotsDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${today}.json`)
  .sort();

let prevSnapshot = null;
if (existingSnapshots.length > 0) {
  const prevFile = existingSnapshots[existingSnapshots.length - 1];
  prevSnapshot = JSON.parse(fs.readFileSync(path.join(snapshotsDir, prevFile), "utf8"));
  console.log(`Poprzedni snapshot: ${prevFile} (${prevSnapshot.offerCount} ofert)`);
}

const events = computeDiff(prevSnapshot, currSnapshot);

// Zapis snapshotu
const snapPath = path.join(snapshotsDir, `${today}.json`);
fs.writeFileSync(snapPath, JSON.stringify(currSnapshot, null, 2) + "\n");

// Append eventy do rocznego pliku JSONL
if (events.length > 0) {
  const year = today.slice(0, 4);
  const eventsPath = path.join(eventsDir, `${year}.jsonl`);
  const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.appendFileSync(eventsPath, lines);
  console.log(`Eventów: ${events.length} → data/events/${year}.jsonl`);

  const byType = events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});
  console.log("Podział:", byType);
} else {
  console.log("Brak zmian w stosunku do poprzedniego snapshotu.");
}

console.log(`Snapshot ${today}: ${offers.length} ofert → ${path.relative(ROOT, snapPath)}`);
