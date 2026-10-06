import { isIsoDate } from "./dates.js";

// Search settings carried in a shared link (?from=KUL&max=1500&...). They override
// remembered preferences for this visit so the recipient sees the same search.
const SHARED = (() => {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
})();
function sharedValue(name, isValid, parse = (value) => value) {
  const raw = SHARED.get(name);
  if (raw === null || !isValid(raw)) return undefined;
  return parse(raw);
}
const isFare = (value) => /^\d{1,4}$/.test(value) && Number(value) <= 5000;
const isTripDays = (value) => /^\d{1,2}$/.test(value) && Number(value) >= 2 && Number(value) <= 21;
export const SHARED_SEARCH = {
  origin: sharedValue("from", (value) => ["ALL", "PEN", "KUL"].includes(value)),
  minPrice: sharedValue("min", isFare, Number),
  maxPrice: sharedValue("max", isFare, Number),
  stops: sharedValue("stops", (value) => ["any", "1", "2", "3"].includes(value)),
  dateMode: sharedValue("dates", (value) => ["anytime", "specific", "month"].includes(value)),
  outboundDate: sharedValue("depart", isIsoDate),
  returnDate: sharedValue("return", isIsoDate),
  travelMonth: sharedValue("month", (value) => /^\d{4}-\d{2}$/.test(value)),
  minTripDays: sharedValue("minDays", isTripDays),
  maxTripDays: sharedValue("maxDays", isTripDays),
  view: sharedValue("view", (value) => value === "flights"),
  destination: SHARED.get("to") && /^[A-Z]{3}$/.test(SHARED.get("to")) && SHARED.get("toName")
    ? { id: SHARED.get("to"), type: "airport", name: SHARED.get("toName").slice(0, 120), description: (SHARED.get("toDesc") || "").slice(0, 120) }
    : null,
};
if (SHARED_SEARCH.minPrice !== undefined && SHARED_SEARCH.maxPrice !== undefined && SHARED_SEARCH.minPrice >= SHARED_SEARCH.maxPrice) {
  SHARED_SEARCH.minPrice = undefined;
}
