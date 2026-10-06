// Shared deal helpers, kept free of React so they can be unit-tested (savedDeals.test.js).

export const HOME_AIRPORTS = { PEN: { lat: 5.2971, lon: 100.2769 }, KUL: { lat: 2.7456, lon: 101.7099 } };

export function searchableText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function isLiveDeal(deal) {
  return deal?.theme === "Live";
}

// The cheapest fare in a live result for exactly the trip a saved deal describes:
// same city, one of the saved departure airports, and the same dates. Anything else
// is a different trip, not a price change.
export function sameTripFare(entry, liveDeal) {
  if (searchableText(entry.city) !== searchableText(liveDeal.city)) return null;
  // Each saved airport is paired with its own dates (PEN and KUL can differ).
  const savedTrips = new Set(entry.originOptions?.length
    ? entry.originOptions.map((option) => `${option.origin}|${option.date}`)
    : (entry.origins || [entry.origin]).map((code) => `${code}|${entry.date}`));
  const options = liveDeal.originOptions?.length
    ? liveDeal.originOptions
    : [{ origin: liveDeal.origin, price: liveDeal.price, date: liveDeal.date, link: liveDeal.link, airline: liveDeal.airline, airlineCode: liveDeal.airlineCode }];
  const matches = options
    .filter((option) => HOME_AIRPORTS[option.origin] && savedTrips.has(`${option.origin}|${option.date}`))
    .sort((a, b) => a.price - b.price);
  return matches.length ? { ...matches[0], options: matches } : null;
}
