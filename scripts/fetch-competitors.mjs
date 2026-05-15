/**
 * Pobiera oferty konkurencji (otodom, OLX) dla regionu Wągrowiec/Rogoźno
 * i zapisuje data/competitors/{source}/YYYY-MM-DD.json.
 *
 * Uruchamiane raz na dobę przez GitHub Actions (osobny workflow,
 * żeby błąd scrapingu nie zablokował głównych statystyk).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchOtodomSnapshot } from "../lib/competitors/otodom.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

async function save(source, offers) {
  const dir = path.join(ROOT, "data", "competitors", source);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${today}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify(
      { source, date: today, generatedAt: new Date().toISOString(), offerCount: offers.length, offers },
      null,
      2,
    ) + "\n",
  );
  console.log(`[${source}] ${offers.length} ofert → ${path.relative(ROOT, out)}`);
}

async function main() {
  const cities = (process.env.COMPETITOR_CITIES || "wagrowiec,rogozno")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Pobieram konkurencję dla: ${cities.join(", ")}`);

  try {
    const otodom = await fetchOtodomSnapshot({ cities });
    await save("otodom", otodom);
  } catch (err) {
    console.error("[otodom] Błąd:", err.message);
  }

  // OLX zostawiam jako TODO - inna struktura, dodam w kolejnej iteracji
}

main().catch((err) => {
  console.error("[fetch-competitors] Błąd:", err.message);
  process.exit(1);
});
