/**
 * Scraper Otodom — używa __NEXT_DATA__ embedded w HTML, paginacja.
 *
 * Działa ostrożnie:
 *  - realistyczny User-Agent
 *  - 4-7s delay między requestami (z jitter)
 *  - max 5 stron per kategoria/miasto (50 ofert/page = 250 max)
 *  - graceful failure: pojedynczy 404/błąd nie zatrzymuje pętli
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE = "https://www.otodom.pl";

const CATEGORIES = [
  { key: "mieszkanie", estate: "FLAT" },
  { key: "dom", estate: "HOUSE" },
  { key: "dzialka", estate: "PLOT" },
];

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

function parseNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s);
  if (!m) return null;
  return JSON.parse(m[1]);
}

function extractOffers(nextData) {
  const items = nextData?.props?.pageProps?.data?.searchAds?.items;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeOffer).filter(Boolean);
}

const ROOMS_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX_OR_MORE: 6, SEVEN_OR_MORE: 7 };
const FLOOR_MAP = {
  GROUND: 0, FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6,
  SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10, ABOVE_TENTH: 11, CELLAR: -1, GARRET: 99,
};

function enumToNum(v, map) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && map[v] != null) return map[v];
  return null;
}

function normalizeOffer(it) {
  const price = it.totalPrice?.value ?? null;
  const currency = it.totalPrice?.currency ?? "PLN";
  if (currency && currency !== "PLN") return null;

  const href = it.href
    ? `${BASE}${it.href.replace("[lang]", "/pl")}`
    : null;

  return {
    source: "otodom",
    externalId: String(it.id),
    title: it.title ?? "",
    estate: it.estate ?? "",
    transaction: it.transaction ?? "",
    pricePln: price ? Math.round(price) : null,
    pricePerM2: it.pricePerSquareMeter?.value ? Math.round(it.pricePerSquareMeter.value) : null,
    areaM2: it.areaInSquareMeters ?? null,
    rooms: enumToNum(it.roomsNumber, ROOMS_MAP),
    floor: enumToNum(it.floorNumber, FLOOR_MAP),
    city: it.location?.address?.city?.name ?? "",
    street: it.location?.address?.street?.name ?? "",
    province: it.location?.address?.province?.name ?? "",
    isPrivate: it.isPrivateOwner ?? false,
    agencyName: it.agency?.name ?? null,
    dateCreated: it.dateCreated ?? null,
    pushedUpAt: it.pushedUpAt ?? null,
    href,
  };
}

/**
 * Pobiera oferty z otodom dla danego miasta + kategorii.
 * Iteruje strony, aż wyczerpie listę albo trafi na pustą.
 */
export async function fetchOtodomForCity({ category, citySlug, maxPages = 5 }) {
  const offers = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE}/pl/oferty/sprzedaz/${category}/${citySlug}?page=${page}`;
    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      console.warn(`[otodom] ${citySlug}/${category} strona ${page}: ${err.message}`);
      break;
    }
    const nextData = parseNextData(html);
    if (!nextData) {
      console.warn(`[otodom] Brak __NEXT_DATA__ na stronie ${page}`);
      break;
    }
    const pageOffers = extractOffers(nextData);
    if (pageOffers.length === 0) break;
    offers.push(...pageOffers);
    console.log(`[otodom] ${citySlug}/${category} p.${page}: ${pageOffers.length} ofert`);
    if (page < maxPages) await sleep(jitterDelay());
  }
  return offers;
}

export async function fetchOtodomSnapshot({ cities = ["wagrowiec", "rogozno"] } = {}) {
  const allOffers = [];
  for (const citySlug of cities) {
    for (const { key } of CATEGORIES) {
      const offers = await fetchOtodomForCity({ category: key, citySlug, maxPages: 5 });
      allOffers.push(...offers);
      await sleep(jitterDelay());
    }
  }
  // Deduplikacja po externalId (offer może pojawić się w kilku kategoriach)
  const byId = new Map();
  for (const o of allOffers) byId.set(o.externalId, o);
  return Array.from(byId.values());
}
