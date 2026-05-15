/**
 * Czyta wszystkie eventy z data/events/*.jsonl i zwraca jako tablicę.
 */
import fs from "node:fs";
import path from "node:path";

export function loadAllEvents(eventsDir) {
  if (!fs.existsSync(eventsDir)) return [];
  const files = fs
    .readdirSync(eventsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  const events = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(eventsDir, file), "utf8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        events.push(JSON.parse(t));
      } catch {
        // skip malformed
      }
    }
  }
  return events;
}

/** Buduje timeline każdej oferty z eventów (signature → lista zdarzeń chronologicznie). */
export function buildOfferTimelines(events) {
  const byOffer = new Map();
  for (const e of events) {
    if (!e.signature) continue;
    if (!byOffer.has(e.signature)) byOffer.set(e.signature, []);
    byOffer.get(e.signature).push(e);
  }
  for (const list of byOffer.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byOffer;
}
