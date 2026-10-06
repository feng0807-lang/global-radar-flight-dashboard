// Advanced filters and sorting for Google Flights-style results. Everything runs on
// flights already fetched, so changing a filter is instant and spends no API quota.

export const DAY_MINUTES = 24 * 60;
// Red-eye: a leg Google marks as overnight, or a departure between 22:00 and 05:00.
export const RED_EYE_START = 22 * 60;
export const RED_EYE_END = 5 * 60;
export function isRedEye(flight) {
  if (flight.legs?.some((leg) => leg.overnight)) return true;
  return flight.departMinutes !== null && (flight.departMinutes >= RED_EYE_START || flight.departMinutes < RED_EYE_END);
}

export const DEFAULT_FLIGHT_FILTERS = {
  maxStops: "any", // "any" | "0" | "1" | "2"
  excludedAirlines: [],
  excludedOrigins: [],
  excludedLayoverAirports: [],
  maxPrice: null,
  departWindow: [0, DAY_MINUTES],
  arriveWindow: [0, DAY_MINUTES],
  maxDuration: null, // minutes, total journey
  minLayover: 0, // minutes; protects against tight connections
  maxLayover: null, // minutes
  avoidOvernightLayovers: false,
  avoidRedEye: false,
  hideOftenDelayed: false,
  lowerEmissionsOnly: false,
};

const inWindow = (minutes, [start, end]) => minutes === null || (minutes >= start && minutes <= end);

export function flightMatches(flight, filters) {
  const f = { ...DEFAULT_FLIGHT_FILTERS, ...filters };
  if (f.maxStops !== "any" && flight.stops > Number(f.maxStops)) return false;
  if (flight.airlines.some((airline) => f.excludedAirlines.includes(airline))) return false;
  if (f.excludedOrigins.includes(flight.origin)) return false;
  if (flight.layovers.some((layover) => f.excludedLayoverAirports.includes(layover.airport))) return false;
  if (f.maxPrice !== null && flight.price > f.maxPrice) return false;
  if (!inWindow(flight.departMinutes, f.departWindow)) return false;
  if (!inWindow(flight.arriveMinutes, f.arriveWindow)) return false;
  if (f.maxDuration !== null && flight.totalDuration > f.maxDuration) return false;
  if (flight.layovers.some((layover) => layover.duration < f.minLayover)) return false;
  if (f.maxLayover !== null && flight.layovers.some((layover) => layover.duration > f.maxLayover)) return false;
  if (f.avoidOvernightLayovers && flight.overnightLayover) return false;
  if (f.avoidRedEye && isRedEye(flight)) return false;
  if (f.hideOftenDelayed && flight.oftenDelayed) return false;
  if (f.lowerEmissionsOnly && !(flight.emissionsDiffPercent !== null && flight.emissionsDiffPercent < 0)) return false;
  return true;
}

export const SORTS = {
  best: { label: "Best", compare: (a, b) => (a.category === b.category ? 0 : a.category === "best" ? -1 : 1) || a.price - b.price },
  cheapest: { label: "Cheapest", compare: (a, b) => a.price - b.price || a.totalDuration - b.totalDuration },
  fastest: { label: "Fastest", compare: (a, b) => a.totalDuration - b.totalDuration || a.price - b.price },
  departEarly: { label: "Earliest departure", compare: (a, b) => (a.departMinutes ?? 0) - (b.departMinutes ?? 0) || a.price - b.price },
  departLate: { label: "Latest departure", compare: (a, b) => (b.departMinutes ?? 0) - (a.departMinutes ?? 0) || a.price - b.price },
  arriveEarly: { label: "Earliest arrival", compare: (a, b) => (a.arriveDayOffset * DAY_MINUTES + (a.arriveMinutes ?? 0)) - (b.arriveDayOffset * DAY_MINUTES + (b.arriveMinutes ?? 0)) || a.price - b.price },
  emissions: { label: "Lowest emissions", compare: (a, b) => (a.emissionsKg ?? Infinity) - (b.emissionsKg ?? Infinity) || a.price - b.price },
};

export function filterAndSortFlights(flights, filters, sort = "best") {
  const compare = (SORTS[sort] || SORTS.best).compare;
  return flights.filter((flight) => flightMatches(flight, filters)).sort(compare);
}

// What the filter panel can offer for this result set.
export function flightFacets(flights) {
  const airlines = new Map();
  const layoverAirports = new Map();
  const origins = new Map();
  for (const flight of flights) {
    for (const airline of flight.airlines) {
      const entry = airlines.get(airline) || { name: airline, count: 0, minPrice: Infinity, logo: flight.airlineLogo };
      entry.count += 1;
      entry.minPrice = Math.min(entry.minPrice, flight.price);
      airlines.set(airline, entry);
    }
    for (const layover of flight.layovers) {
      const entry = layoverAirports.get(layover.airport) || { code: layover.airport, name: layover.name, count: 0 };
      entry.count += 1;
      layoverAirports.set(layover.airport, entry);
    }
    const origin = origins.get(flight.origin) || { code: flight.origin, count: 0, minPrice: Infinity };
    origin.count += 1;
    origin.minPrice = Math.min(origin.minPrice, flight.price);
    origins.set(flight.origin, origin);
  }
  const range = (values) => (values.length ? [Math.min(...values), Math.max(...values)] : [0, 0]);
  const minByStops = (stops) => {
    const prices = flights.filter((flight) => flight.stops <= stops).map((flight) => flight.price);
    return prices.length ? Math.min(...prices) : null;
  };
  return {
    airlines: [...airlines.values()].sort((a, b) => a.minPrice - b.minPrice),
    layoverAirports: [...layoverAirports.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    origins: [...origins.values()].sort((a, b) => a.code.localeCompare(b.code)),
    price: range(flights.map((flight) => flight.price)),
    duration: range(flights.map((flight) => flight.totalDuration)),
    layover: range(flights.flatMap((flight) => flight.layovers.map((layover) => layover.duration))),
    cheapestByStops: { 0: minByStops(0), 1: minByStops(1), 2: minByStops(2), any: minByStops(Infinity) },
  };
}

// Number of active (non-default) filters, for the "Clear filters (n)" button.
export function activeFilterCount(filters) {
  const f = { ...DEFAULT_FLIGHT_FILTERS, ...filters };
  return [
    f.maxStops !== "any",
    f.excludedAirlines.length > 0,
    f.excludedOrigins.length > 0,
    f.excludedLayoverAirports.length > 0,
    f.maxPrice !== null,
    f.departWindow[0] > 0 || f.departWindow[1] < DAY_MINUTES,
    f.arriveWindow[0] > 0 || f.arriveWindow[1] < DAY_MINUTES,
    f.maxDuration !== null,
    f.minLayover > 0,
    f.maxLayover !== null,
    f.avoidOvernightLayovers,
    f.avoidRedEye,
    f.hideOftenDelayed,
    f.lowerEmissionsOnly,
  ].filter(Boolean).length;
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} hr${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}

export function formatClock(minutes) {
  const clamped = Math.max(0, Math.min(DAY_MINUTES, minutes));
  if (clamped === DAY_MINUTES) return "23:59";
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
