// Google Flights-style search: request validation and result normalisation for the
// SerpApi `google_flights` engine. Pure functions, covered by flightSearch.test.mjs.

const AIRPORT = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HOME_ORIGINS = ["PEN", "KUL"];
export const CABINS = { 1: "Economy", 2: "Premium economy", 3: "Business", 4: "First" };

function intParam(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : NaN;
}

// Validate a search request (URLSearchParams from the browser). Returns
// { query } or { error } with a message suitable for the user.
export function parseFlightSearch(searchParams, today = new Date().toISOString().slice(0, 10)) {
  const from = String(searchParams.get("from") || "ALL").toUpperCase();
  const to = String(searchParams.get("to") || "").toUpperCase();
  const depart = searchParams.get("depart") || "";
  const returnDate = searchParams.get("return") || "";
  const tripType = searchParams.get("trip") === "oneway" ? "oneway" : "round";
  const adults = intParam(searchParams.get("adults"), 1, 1, 9);
  const children = intParam(searchParams.get("children"), 0, 0, 8);
  const infants = intParam(searchParams.get("infants"), 0, 0, 4);
  const cabin = intParam(searchParams.get("cabin"), 1, 1, 4);
  const bags = intParam(searchParams.get("bags"), 0, 0, 2);
  const departureToken = searchParams.get("departureToken") || "";

  const origins = from === "ALL" ? HOME_ORIGINS : [from];
  if (!origins.every((code) => AIRPORT.test(code))) return { error: "Choose a valid departure airport." };
  if (!AIRPORT.test(to)) return { error: "Choose a destination airport." };
  if (origins.includes(to)) return { error: "Destination must differ from the departure airport." };
  if (!ISO_DATE.test(depart) || depart < today) return { error: "Choose a departure date from today onwards." };
  if (tripType === "round" && (!ISO_DATE.test(returnDate) || returnDate < depart)) {
    return { error: "Choose a return date on or after the departure date." };
  }
  if ([adults, children, infants, cabin, bags].some(Number.isNaN)) return { error: "Check passengers, cabin, and bags." };
  if (infants > adults) return { error: "Each infant needs an accompanying adult." };
  if (adults + children + infants > 9) return { error: "Search up to 9 passengers at a time." };
  if (departureToken && (departureToken.length > 2000 || origins.length !== 1)) return { error: "Invalid outbound selection." };

  return {
    query: { origins, to, depart, returnDate: tripType === "round" ? returnDate : "", tripType, adults, children, infants, cabin, bags, departureToken },
  };
}

// SerpApi parameters for one origin. Stops, airlines, times, and durations are left
// open on purpose: the browser filters the full result set instantly and for free.
export function serpApiFlightParams(query, origin) {
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: origin,
    arrival_id: query.to,
    outbound_date: query.depart,
    type: query.tripType === "round" ? "1" : "2",
    travel_class: String(query.cabin),
    adults: String(query.adults),
    currency: "MYR",
    hl: "en",
    gl: "my",
  });
  if (query.tripType === "round") params.set("return_date", query.returnDate);
  if (query.children) params.set("children", String(query.children));
  if (query.infants) params.set("infants_on_lap", String(query.infants));
  if (query.bags) params.set("bags", String(query.bags));
  if (query.departureToken) params.set("departure_token", query.departureToken);
  return params;
}

// "2026-11-02 08:35" → { date: "2026-11-02", time: "08:35", minutes: 515 }
function splitTime(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/);
  if (!match) return { date: "", time: "", minutes: null };
  const hours = Number(match[2]);
  return { date: match[1], time: `${String(hours).padStart(2, "0")}:${match[3]}`, minutes: hours * 60 + Number(match[3]) };
}

function dayOffset(fromDate, toDate) {
  if (!fromDate || !toDate) return 0;
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

// One SerpApi flight option → a flat, filterable record.
export function normalizeFlightOption(option, { origin, category, index }) {
  const legs = (option.flights || []).map((leg) => {
    const departure = splitTime(leg.departure_airport?.time);
    const arrival = splitTime(leg.arrival_airport?.time);
    return {
      from: String(leg.departure_airport?.id || ""),
      fromName: String(leg.departure_airport?.name || ""),
      to: String(leg.arrival_airport?.id || ""),
      toName: String(leg.arrival_airport?.name || ""),
      departDate: departure.date,
      departTime: departure.time,
      arriveDate: arrival.date,
      arriveTime: arrival.time,
      duration: Number(leg.duration) || 0,
      airline: String(leg.airline || "Airline"),
      airlineLogo: typeof leg.airline_logo === "string" && leg.airline_logo.startsWith("https://") ? leg.airline_logo : "",
      flightNumber: String(leg.flight_number || ""),
      airplane: String(leg.airplane || ""),
      travelClass: String(leg.travel_class || ""),
      legroom: String(leg.legroom || ""),
      overnight: Boolean(leg.overnight),
      oftenDelayed: Boolean(leg.often_delayed_by_over_30_min),
    };
  });
  const layovers = (option.layovers || []).map((layover) => ({
    airport: String(layover.id || ""),
    name: String(layover.name || ""),
    duration: Number(layover.duration) || 0,
    overnight: Boolean(layover.overnight),
  }));
  const first = legs[0] || {};
  const last = legs[legs.length - 1] || {};
  const departMinutes = splitTime(option.flights?.[0]?.departure_airport?.time).minutes;
  const arriveMinutes = splitTime(option.flights?.[option.flights.length - 1]?.arrival_airport?.time).minutes;
  const emissions = option.carbon_emissions || {};
  const airlines = [...new Set(legs.map((leg) => leg.airline))];
  const price = Number(option.price) || 0;
  return {
    id: `${origin}-${category}-${index}-${legs.map((leg) => leg.flightNumber).join("+")}`,
    origin,
    category,
    price,
    airlines,
    airlineLogo: typeof option.airline_logo === "string" && option.airline_logo.startsWith("https://") ? option.airline_logo : first.airlineLogo || "",
    from: first.from || origin,
    to: last.to || "",
    departDate: first.departDate || "",
    departTime: first.departTime || "",
    departMinutes,
    arriveDate: last.arriveDate || "",
    arriveTime: last.arriveTime || "",
    arriveMinutes,
    arriveDayOffset: dayOffset(first.departDate, last.arriveDate),
    totalDuration: Number(option.total_duration) || legs.reduce((sum, leg) => sum + leg.duration, 0) + layovers.reduce((sum, layover) => sum + layover.duration, 0),
    stops: layovers.length || Math.max(0, legs.length - 1),
    layovers,
    legs,
    overnightLayover: layovers.some((layover) => layover.overnight),
    oftenDelayed: legs.some((leg) => leg.oftenDelayed),
    emissionsKg: emissions.this_flight ? Math.round(emissions.this_flight / 1000) : null,
    emissionsDiffPercent: Number.isFinite(emissions.difference_percent) ? emissions.difference_percent : null,
    departureToken: typeof option.departure_token === "string" ? option.departure_token : "",
  };
}

export function normalizeFlightResults(payload, origin) {
  const pick = (list, category) => (Array.isArray(list) ? list : [])
    .map((option, index) => normalizeFlightOption(option, { origin, category, index }))
    .filter((flight) => flight.price > 0 && flight.legs.length > 0);
  const insights = payload?.price_insights || null;
  return {
    flights: [...pick(payload?.best_flights, "best"), ...pick(payload?.other_flights, "other")],
    priceInsights: insights ? {
      lowestPrice: Number(insights.lowest_price) || null,
      priceLevel: typeof insights.price_level === "string" ? insights.price_level : null,
      typicalRange: Array.isArray(insights.typical_price_range) && insights.typical_price_range.length === 2 ? insights.typical_price_range.map(Number) : null,
    } : null,
    googleFlightsUrl: typeof payload?.search_metadata?.google_flights_url === "string" ? payload.search_metadata.google_flights_url : "",
  };
}
