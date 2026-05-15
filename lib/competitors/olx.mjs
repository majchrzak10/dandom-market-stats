/**
 * Scraper OLX — używa window.__PRERENDERED_STATE__ (Apollo state).
 * Pole `externalUrl` często wskazuje na otodom → przydatne do deduplikacji.
 * Bonus: każda oferta ma `map.lat/lon` (GPS).
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE = "https://www.olx.pl";

const CATEGORIES = [
  { key: "mieszkania", estate: "FLAT" },
  { key: "domy", estate: "HOUSE" },
  { key: "dzialki", estate: "PLOT" },
];

const ROOMS_MAP = { one: 1, two: 2, three: 3, four_and_more: 4 };

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterDelay() {
  return 4000 + Math.floor(Math.random() * 3000);
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "pl-PL,pl;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
    },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.text();
}

function extractPrerenderedState(html) {
  const m = html.match(/window\.__PRERENDERED_STATE__\s*=\s*"((?:\\.|[^"\\])+)"/);
  if (!m) return null;
  try {
    return JSON.parse(JSON.parse('"' + m[1] + '"'));
  } catch {
    return null;
  }
}

function paramValue(params, key) {
  return params?.find((p) => p.key === key)?.normalizedValue ?? null;
}

function paramRaw(params, key) {
  return params?.find((p) => p.key === key)?.value ?? null;
}

function normalizeOffer(ad, estate) {
  const price = ad.price?.regularPrice?.value;
  if (!price) return null;

  const params = ad.params || [];
  const areaRaw = paramValue(params, "m");
  const areaM2 = areaRaw ? Number.parseFloat(areaRaw) : null;
  const pricePerM2Raw = paramValue(params, "price_per_m");
  const pricePerM2 = pricePerM2Raw ? Math.round(Number.parseFloat(pricePerM2Raw)) : null;
  const roomsRaw = paramValue(params, "rooms");
  const rooms = ROOMS_MAP[roomsRaw] ?? null;

  return {
    source: "olx",
    externalId: String(ad.id),
    title: ad.title ?? "",
    estate,
    transaction: "SELL",
    pricePln: Math.round(price),
    pricePerM2,
    areaM2,
    rooms,
    floor: null,
    city: ad.location?.cityName ?? "",
    street: "",
    province: ad.location?.regionName ?? "",
    isPrivate: ad.isBusiness === false,
    agencyName: null,
    dateCreated: ad.createdTime ?? null,
    pushedUpAt: ad.lastRefreshTime ?? null,
    href: ad.url ?? null,
    lat: ad.map?.lat ?? null,
    lon: ad.map?.lon ?? null,
    // KLUCZOWE dla deduplikacji: gdy oferta jest też na otodom, OLX podaje link
    externalUrl: ad.externalUrl ?? null,
  };
}

async function fetchOlxForCity({ category, citySlug, estate, maxPages = 5 }) {
  const offers = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1
      ? `${BASE}/nieruchomosci/${category}/sprzedaz/${citySlug}/`
      : `${BASE}/nieruchomosci/${category}/sprzedaz/${citySlug}/?page=${page}`;
    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      console.warn(`[olx] ${citySlug}/${category} p.${page}: ${err.message}`);
      break;
    }
    const state = extractPrerenderedState(html);
    if (!state) break;
    const ads = state?.listing?.listing?.ads || [];
    if (ads.length === 0) break;
    const normalized = ads.map((a) => normalizeOffer(a, estate)).filter(Boolean);
    offers.push(...normalized);
    console.log(`[olx] ${citySlug}/${category} p.${page}: ${normalized.length} ofert`);
    if (page < maxPages) await sleep(jitterDelay());
  }
  return offers;
}

export async function fetchOlxSnapshot({ cities = ["wagrowiec", "rogozno"] } = {}) {
  const all = [];
  for (const citySlug of cities) {
    for (const { key, estate } of CATEGORIES) {
      const offers = await fetchOlxForCity({ category: key, citySlug, estate, maxPages: 5 });
      all.push(...offers);
      await sleep(jitterDelay());
    }
  }
  // Dedup po externalId (ta sama oferta może być w kilku kategoriach)
  const byId = new Map();
  for (const o of all) byId.set(o.externalId, o);
  return Array.from(byId.values());
}
