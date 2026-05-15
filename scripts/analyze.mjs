/**
 * Czyta wszystkie snapshoty z data/snapshots/, wylicza statystyki i zapisuje
 * data/analytics.json — w jednym pliku wszystko czego potrzebuje dashboard.
 *
 * Generuje:
 *  - kpi: aktualne liczby (oferty, średnie ceny, mediany)
 *  - timeSeries: ilość ofert dziennie + nowe/zdjęte
 *  - segmentation: per kategoria, miasto, przedział cenowy
 *  - priceChanges: oferty z udokumentowaną zmianą ceny między snapshotami
 *  - timeOnMarket: lista ofert z liczbą dni od pierwszego pojawienia
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAP_DIR = path.join(ROOT, "data", "snapshots");

function loadSnapshots() {
  if (!fs.existsSync(SNAP_DIR)) return [];
  return fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), "utf8")));
}

function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

function mean(arr) {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function bucketBy(items, keyFn) {
  const buckets = new Map();
  for (const it of items) {
    const k = keyFn(it) || "—";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }
  return Array.from(buckets.entries())
    .map(([key, list]) => ({
      key,
      count: list.length,
      avgPrice: mean(list.map((x) => x.pricePln).filter(Boolean)),
      medianPrice: median(list.map((x) => x.pricePln).filter(Boolean)),
      avgPricePerM2: mean(list.map((x) => x.pricePerM2).filter(Boolean)),
    }))
    .sort((a, b) => b.count - a.count);
}

function daysBetween(dateA, dateB) {
  const a = Date.parse(dateA);
  const b = Date.parse(dateB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

const snapshots = loadSnapshots();
if (snapshots.length === 0) {
  console.error("Brak snapshotów — uruchom najpierw `npm run snapshot`.");
  process.exit(1);
}

const latest = snapshots[snapshots.length - 1];
const offers = latest.offers;
const sale = offers.filter((o) => o.transaction === "SPRZEDAŻ");
const today = latest.date;

const kpi = {
  date: today,
  totalOffers: offers.length,
  sale: sale.length,
  rent: offers.filter((o) => o.transaction === "WYNAJEM").length,
  avgPrice: mean(sale.map((o) => o.pricePln).filter(Boolean)),
  medianPrice: median(sale.map((o) => o.pricePln).filter(Boolean)),
  avgPricePerM2: mean(sale.map((o) => o.pricePerM2).filter(Boolean)),
  byCategory: Object.fromEntries(
    Object.entries(
      offers.reduce((acc, o) => {
        acc[o.category] = (acc[o.category] || 0) + 1;
        return acc;
      }, {}),
    ),
  ),
};

// Trendy w czasie (potrzebują min. 2 snapshotów)
const sigByDate = new Map(snapshots.map((s) => [s.date, new Set(s.offers.map((o) => o.signature))]));
const timeSeries = snapshots.map((s, i) => {
  const prev = i > 0 ? sigByDate.get(snapshots[i - 1].date) : null;
  const curr = sigByDate.get(s.date);
  const added = prev ? [...curr].filter((sig) => !prev.has(sig)).length : 0;
  const removed = prev ? [...prev].filter((sig) => !curr.has(sig)).length : 0;
  return { date: s.date, total: s.offers.length, added, removed };
});

// Zmiany cen między dzisiaj a najstarszym snapshotem zawierającym daną ofertę
const priceHistory = new Map(); // sig → [{ date, price }]
for (const s of snapshots) {
  for (const o of s.offers) {
    if (!o.pricePln) continue;
    if (!priceHistory.has(o.signature)) priceHistory.set(o.signature, []);
    priceHistory.get(o.signature).push({ date: s.date, price: o.pricePln });
  }
}
const priceChanges = [];
for (const o of offers) {
  const h = priceHistory.get(o.signature) || [];
  if (h.length < 2) continue;
  const first = h[0];
  const last = h[h.length - 1];
  if (first.price === last.price) continue;
  priceChanges.push({
    signature: o.signature,
    title: o.title,
    city: o.city,
    firstPrice: first.price,
    currentPrice: last.price,
    diff: last.price - first.price,
    diffPct: Math.round(((last.price - first.price) / first.price) * 1000) / 10,
    firstSeen: first.date,
    daysObserved: daysBetween(first.date, last.date),
  });
}
priceChanges.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

// Time-on-market — używamy firstSeenAt z czytnika (data pierwszej paczki XML z tą sygnaturą)
const timeOnMarket = offers.map((o) => ({
  signature: o.signature,
  title: o.title,
  city: o.city,
  pricePln: o.pricePln,
  firstSeenAt: o.firstSeenAt,
  daysOnMarket: o.firstSeenAt ? daysBetween(o.firstSeenAt, today) : null,
}));
timeOnMarket.sort((a, b) => (b.daysOnMarket ?? 0) - (a.daysOnMarket ?? 0));

const analytics = {
  generatedAt: new Date().toISOString(),
  kpi,
  timeSeries,
  segmentation: {
    byCategory: bucketBy(sale, (o) => o.category),
    byCity: bucketBy(sale, (o) => o.city),
    byRooms: bucketBy(sale.filter((o) => o.rooms), (o) => `${o.rooms} pok.`),
  },
  priceChanges,
  timeOnMarket,
};

fs.writeFileSync(path.join(ROOT, "data", "analytics.json"), JSON.stringify(analytics, null, 2) + "\n");
console.log(
  `Analytics: ${kpi.totalOffers} ofert, ${priceChanges.length} zmian cen, ${timeSeries.length} dni historii.`,
);
