/**
 * Deduplikacja ofert konkurencji.
 *
 * Strategie matchowania (od najbardziej do najmniej pewnej):
 *
 * 1. EXTERNAL URL (najpewniejsza)
 *    OLX `externalUrl` często wskazuje konkretną ofertę na otodom.
 *    Wyciągamy otodom slug z URL i matchujemy z otodom.slug.
 *
 * 2. SAME CITY + SAME AREA + SAME PRICE (±2%)
 *    Identyczna oferta wystawiona na dwóch portalach.
 *
 * Każda zduplikowana oferta dostaje:
 *   - sources: ["olx", "otodom"]
 *   - duplicateOfId: ID drugiej strony (opcjonalnie)
 * Lista wynikowa: bez duplikatów, każda oferta UNIKALNA z metadatą.
 */

function otodomSlugFromUrl(url) {
  if (!url) return null;
  const m = url.match(/-(ID[0-9a-zA-Z]+)(?:\.html|$|\/)/);
  return m ? m[1] : null;
}

function otodomSlugFromHref(href) {
  if (!href) return null;
  const m = href.match(/-(ID[0-9a-zA-Z]+)(?:\/|$)/);
  return m ? m[1] : null;
}

function approxEqual(a, b, tolerancePct = 2) {
  if (a == null || b == null) return false;
  if (a === 0 || b === 0) return a === b;
  return Math.abs(a - b) / Math.max(a, b) <= tolerancePct / 100;
}

function buildMatchKey(offer) {
  // Klucz oparty na: miasto + powierzchnia (zaokrąglona) + cena (zaokrąglona w 5% bucket)
  if (!offer.city || !offer.areaM2 || !offer.pricePln) return null;
  const areaBucket = Math.round(offer.areaM2);
  const priceBucket = Math.round(offer.pricePln / 5000) * 5000;
  return `${offer.city.toUpperCase()}|${areaBucket}|${priceBucket}`;
}

/**
 * Zwraca: { unique: [...], duplicates: [...], stats }
 * - unique: lista unikalnych ofert (każda z metadata sources)
 * - duplicates: lista ofert które były duplikatami (dla debug)
 */
export function dedupeCompetitorOffers({ otodom, olx }) {
  const otodomBySlug = new Map();
  for (const o of otodom) {
    const slug = otodomSlugFromHref(o.href);
    if (slug) otodomBySlug.set(slug, o);
  }

  const unique = [];
  const duplicates = [];

  // 1. Wszystkie otodom idą do unique (z sources: ["otodom"])
  for (const o of otodom) {
    unique.push({ ...o, sources: ["otodom"] });
  }

  // Index unique po klucz "miasto|powierzchnia|cena" do matchowania
  const matchKeyToIndex = new Map();
  for (let i = 0; i < unique.length; i++) {
    const k = buildMatchKey(unique[i]);
    if (k) {
      if (!matchKeyToIndex.has(k)) matchKeyToIndex.set(k, []);
      matchKeyToIndex.get(k).push(i);
    }
  }

  // 2. Dla każdej OLX: sprawdź czy duplikat
  let viaExternalUrl = 0;
  let viaKeyMatch = 0;

  for (const o of olx) {
    // 2a. Match przez externalUrl → otodom slug
    const externalSlug = otodomSlugFromUrl(o.externalUrl);
    if (externalSlug && otodomBySlug.has(externalSlug)) {
      const target = otodomBySlug.get(externalSlug);
      const idx = unique.findIndex((u) => u.externalId === target.externalId);
      if (idx >= 0 && !unique[idx].sources.includes("olx")) {
        unique[idx].sources.push("olx");
        unique[idx].olxId = o.externalId;
        // Wzbogać o GPS z OLX jeśli otodom go nie ma
        if (!unique[idx].lat && o.lat) {
          unique[idx].lat = o.lat;
          unique[idx].lon = o.lon;
        }
        viaExternalUrl++;
        duplicates.push({ olxId: o.externalId, matched: target.externalId, via: "externalUrl" });
        continue;
      }
    }

    // 2b. Match przez klucz miasto+powierzchnia+cena
    const key = buildMatchKey(o);
    if (key && matchKeyToIndex.has(key)) {
      // Sprawdź precyzyjne dopasowanie (±2% na cenę i metraż)
      const candidates = matchKeyToIndex.get(key);
      let matchedIdx = null;
      for (const idx of candidates) {
        const u = unique[idx];
        if (approxEqual(u.areaM2, o.areaM2, 3) && approxEqual(u.pricePln, o.pricePln, 2)) {
          matchedIdx = idx;
          break;
        }
      }
      if (matchedIdx != null && !unique[matchedIdx].sources.includes("olx")) {
        unique[matchedIdx].sources.push("olx");
        unique[matchedIdx].olxId = o.externalId;
        if (!unique[matchedIdx].lat && o.lat) {
          unique[matchedIdx].lat = o.lat;
          unique[matchedIdx].lon = o.lon;
        }
        viaKeyMatch++;
        duplicates.push({ olxId: o.externalId, matched: unique[matchedIdx].externalId, via: "key" });
        continue;
      }
    }

    // 2c. Nie duplikat — dodaj jako unikalny OLX
    unique.push({ ...o, sources: ["olx"] });
  }

  return {
    unique,
    duplicates,
    stats: {
      otodomTotal: otodom.length,
      olxTotal: olx.length,
      uniqueCombined: unique.length,
      duplicatesFound: duplicates.length,
      viaExternalUrl,
      viaKeyMatch,
    },
  };
}
