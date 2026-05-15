/**
 * CLI: pokazuje pełną historię konkretnej oferty.
 * Użycie: npm run history -- 128/6093/OGS
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllEvents, buildOfferTimelines } from "../lib/events-loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const signature = process.argv[2];
if (!signature) {
  console.error("Użycie: npm run history -- <signature>");
  console.error("Przykład: npm run history -- 128/6093/OGS");
  process.exit(1);
}

const events = loadAllEvents(path.join(ROOT, "data", "events"));
const timelines = buildOfferTimelines(events);
const timeline = timelines.get(signature);

if (!timeline) {
  console.error(`Brak historii dla sygnatury "${signature}".`);
  console.error(`Dostępne sygnatury: ${timelines.size}`);
  process.exit(1);
}

console.log(`\n=== Historia oferty ${signature} ===\n`);
for (const e of timeline) {
  const label = ({
    offer_added: "🟢 NOWA",
    offer_removed: "🔴 ZNIKNĘŁA",
    price_changed: "💰 ZMIANA CENY",
    area_changed: "📏 ZMIANA METRAŻU",
    rooms_changed: "🚪 ZMIANA POKOI",
    agent_changed: "👤 ZMIANA AGENTA",
    title_changed: "✏️  ZMIANA TYTUŁU",
  })[e.type] || e.type;

  console.log(`[${e.date}] ${label}`);
  if (e.type === "offer_added") {
    console.log(`  ${e.title}`);
    console.log(`  ${e.city} · ${e.areaM2} m² · ${e.pricePln?.toLocaleString("pl-PL")} zł`);
    console.log(`  Agent: ${e.agentName}`);
  } else if (e.type === "offer_removed") {
    console.log(`  ${e.title} (${e.daysOnMarket} dni na rynku, ostatnia cena: ${e.lastPricePln?.toLocaleString("pl-PL")} zł)`);
  } else if (e.type === "price_changed") {
    const arrow = e.diff < 0 ? "↓" : "↑";
    console.log(`  ${e.from?.toLocaleString("pl-PL")} zł ${arrow} ${e.to?.toLocaleString("pl-PL")} zł (${e.diffPct > 0 ? "+" : ""}${e.diffPct}%)`);
  } else if (e.from != null) {
    console.log(`  ${e.from} → ${e.to}`);
  }
  console.log("");
}
