import { isIsoDate } from "./dates.js";
import { HOME_AIRPORTS } from "./savedDeals.js";

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

// A Google Flights search for any deal. Live fares carry ISO dates ("2026-11-02 – 2026-11-09");
// demo fares only have display dates, so those links search the route without dates.
export function googleFlightsSearchUrl(deal, fallbackOrigin) {
  const from = (deal.origins || [deal.origin]).find((code) => HOME_AIRPORTS[code]) || (HOME_AIRPORTS[fallbackOrigin] ? fallbackOrigin : "KUL");
  const [start, end] = String(deal.date || "").split(" – ");
  const dates = isIsoDate(start || "") && isIsoDate(end || "") ? ` on ${start} through ${end}` : "";
  const query = `Flights from ${from} to ${deal.city}${dates}`;
  return `https://www.google.com/travel/flights?hl=en&curr=MYR&q=${encodeURIComponent(query)}`;
}
