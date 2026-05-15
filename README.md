# dandom-market-stats

Statystyki ofert nieruchomości dan-dom.pl. Codzienne snapshoty feeda Asari, dashboard HTML z trendami, analiza time-on-market i zmian cen.

## Architektura

```
fetch-xml.mjs    → pobiera najnowszy *_001.xml z repo Strona-Dan-Dom (raw.githubusercontent)
snapshot.mjs     → parsuje XML, zapisuje data/snapshots/YYYY-MM-DD.json
analyze.mjs      → liczy KPI, time-on-market, zmiany cen → data/analytics.json
build-dashboard.mjs → generuje dist/index.html (Chart.js + Tailwind)
```

GitHub Actions uruchamia `npm run all` codziennie o 6:00 UTC i deployuje `dist/` na GitHub Pages.

## Fazy

- **Faza 1** (teraz): tylko dan-dom.pl — KPI, trendy, time-on-market, segmentacja
- **Faza 2**: benchmark konkurencji (otodom/OLX) dla tego samego regionu
- **Faza 3**: cotygodniowy digest mailem/Notion

## Źródło danych

Repo `majchrzak10/Strona-Dan-Dom`, folder `asari-export/`. Pliki paczek: `6093_YYYYMMDD_HHMMSS_001.xml` (format EbiuroV2).

## Lokalne uruchomienie

```bash
npm install
npm run all
open dist/index.html
```
