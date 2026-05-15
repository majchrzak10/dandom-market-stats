/**
 * Generuje dist/index.html — self-contained dashboard z osadzonym analytics.json.
 * Hostowane na GitHub Pages przez workflow.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const analytics = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "analytics.json"), "utf8"),
);

const distDir = path.join(ROOT, "dist");
fs.mkdirSync(distDir, { recursive: true });

const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Statystyki ofert — Dan-Dom</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .kpi-card { transition: transform 0.15s; }
  .kpi-card:hover { transform: translateY(-2px); }
</style>
</head>
<body class="bg-stone-50 text-stone-900">
<div class="max-w-7xl mx-auto p-6 md:p-10">
  <header class="mb-8">
    <h1 class="text-3xl md:text-4xl font-bold tracking-tight">Statystyki ofert Dan-Dom</h1>
    <p class="text-stone-600 mt-2">
      Aktualizacja: <span id="updated"></span> · Źródło: feed Asari → repo Strona-Dan-Dom
    </p>
  </header>

  <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10" id="kpi-cards"></section>

  <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
    <div class="bg-white rounded-2xl shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Oferty w czasie</h2>
      <canvas id="time-series-chart"></canvas>
    </div>
    <div class="bg-white rounded-2xl shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Podział wg kategorii</h2>
      <canvas id="category-chart"></canvas>
    </div>
  </section>

  <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
    <div class="bg-white rounded-2xl shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Oferty wg miejscowości (sprzedaż)</h2>
      <canvas id="city-chart"></canvas>
    </div>
    <div class="bg-white rounded-2xl shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Średnia cena/m² wg kategorii</h2>
      <canvas id="price-per-m2-chart"></canvas>
    </div>
  </section>

  <section class="bg-white rounded-2xl shadow-sm p-6 mb-10">
    <h2 class="text-lg font-semibold mb-4">Najdłużej na rynku (top 10)</h2>
    <table class="w-full text-sm">
      <thead class="text-stone-500 text-left border-b">
        <tr><th class="pb-2">Oferta</th><th class="pb-2">Miasto</th><th class="pb-2 text-right">Cena</th><th class="pb-2 text-right">Dni</th></tr>
      </thead>
      <tbody id="tom-table"></tbody>
    </table>
  </section>

  <section class="bg-white rounded-2xl shadow-sm p-6 mb-10" id="price-changes-section">
    <h2 class="text-lg font-semibold mb-4">Zmiany cen</h2>
    <div id="price-changes-content" class="text-stone-500">Zmiany cen pojawią się po zebraniu więcej snapshotów (min. 2 dni historii).</div>
  </section>
</div>

<script>
const A = ${JSON.stringify(analytics, null, 2)};

document.getElementById("updated").textContent = new Date(A.generatedAt).toLocaleString("pl-PL");

const fmtPLN = (n) => n == null ? "—" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n) + " zł";

const kpiData = [
  { label: "Aktywnych ofert", value: A.kpi.totalOffers },
  { label: "Średnia cena", value: fmtPLN(A.kpi.avgPrice) },
  { label: "Mediana ceny", value: fmtPLN(A.kpi.medianPrice) },
  { label: "Średnia cena/m²", value: fmtPLN(A.kpi.avgPricePerM2) },
];
document.getElementById("kpi-cards").innerHTML = kpiData.map(k => \`
  <div class="kpi-card bg-white rounded-2xl shadow-sm p-5">
    <div class="text-xs uppercase tracking-wider text-stone-500">\${k.label}</div>
    <div class="text-2xl font-bold mt-2">\${k.value}</div>
  </div>
\`).join("");

new Chart(document.getElementById("time-series-chart"), {
  type: "line",
  data: {
    labels: A.timeSeries.map(t => t.date),
    datasets: [{ label: "Aktywne oferty", data: A.timeSeries.map(t => t.total), borderColor: "#800020", backgroundColor: "rgba(128,0,32,0.1)", tension: 0.3, fill: true }],
  },
  options: { responsive: true, plugins: { legend: { display: false } } },
});

const catEntries = Object.entries(A.kpi.byCategory);
new Chart(document.getElementById("category-chart"), {
  type: "doughnut",
  data: {
    labels: catEntries.map(([k]) => k),
    datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: ["#800020", "#b8860b", "#5d7e3f", "#4a6fa5", "#8c4a6a"] }],
  },
});

new Chart(document.getElementById("city-chart"), {
  type: "bar",
  data: {
    labels: A.segmentation.byCity.slice(0, 8).map(b => b.key),
    datasets: [{ label: "Liczba ofert", data: A.segmentation.byCity.slice(0, 8).map(b => b.count), backgroundColor: "#800020" }],
  },
  options: { indexAxis: "y", plugins: { legend: { display: false } } },
});

new Chart(document.getElementById("price-per-m2-chart"), {
  type: "bar",
  data: {
    labels: A.segmentation.byCategory.map(b => b.key),
    datasets: [{ label: "śr. zł/m²", data: A.segmentation.byCategory.map(b => b.avgPricePerM2 ?? 0), backgroundColor: "#b8860b" }],
  },
  options: { plugins: { legend: { display: false } } },
});

document.getElementById("tom-table").innerHTML = A.timeOnMarket.slice(0, 10).map(t => \`
  <tr class="border-b last:border-0">
    <td class="py-2">\${t.title}</td>
    <td class="py-2">\${t.city}</td>
    <td class="py-2 text-right">\${fmtPLN(t.pricePln)}</td>
    <td class="py-2 text-right font-semibold">\${t.daysOnMarket ?? "—"}</td>
  </tr>
\`).join("");

if (A.priceChanges.length > 0) {
  document.getElementById("price-changes-content").innerHTML = \`
    <table class="w-full text-sm">
      <thead class="text-stone-500 text-left border-b">
        <tr><th class="pb-2">Oferta</th><th class="pb-2">Miasto</th><th class="pb-2 text-right">Pierwsza</th><th class="pb-2 text-right">Aktualna</th><th class="pb-2 text-right">Zmiana</th></tr>
      </thead>
      <tbody>
        \${A.priceChanges.slice(0, 20).map(p => \`
          <tr class="border-b last:border-0">
            <td class="py-2">\${p.title}</td>
            <td class="py-2">\${p.city}</td>
            <td class="py-2 text-right">\${fmtPLN(p.firstPrice)}</td>
            <td class="py-2 text-right">\${fmtPLN(p.currentPrice)}</td>
            <td class="py-2 text-right font-semibold \${p.diff < 0 ? "text-green-700" : "text-red-700"}">\${p.diffPct > 0 ? "+" : ""}\${p.diffPct}%</td>
          </tr>
        \`).join("")}
      </tbody>
    </table>
  \`;
}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(distDir, "index.html"), html);
console.log(`Dashboard → dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
