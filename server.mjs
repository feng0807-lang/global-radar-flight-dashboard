import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleRoutes, collapseDeals, daysBetween, durationGroupsFor, googleFlightsUrl, mapDestination, mapSpecificFlight, parsePrice } from "./lib/fares.mjs";

const root = fileURLToPath(new URL("./dist", import.meta.url));
try {
  process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {
  // The dashboard remains usable in demo mode when no private .env exists.
}
const port = Number(process.env.PORT || 4174);
const apiKey = process.env.SERPAPI_KEY;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

const WORLDWIDE_FALLBACK_DESTINATIONS = [
  { id: "BKK", name: "Bangkok (BKK)", description: "Thailand", lat: 13.7563, lon: 100.5018, image: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=700&q=85" },
  { id: "SIN", name: "Singapore (SIN)", description: "Singapore", lat: 1.3521, lon: 103.8198, image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=700&q=85" },
  { id: "SGN", name: "Ho Chi Minh City (SGN)", description: "Vietnam", lat: 10.8231, lon: 106.6297, image: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=700&q=85" },
  { id: "DPS", name: "Bali (DPS)", description: "Indonesia", lat: -8.65, lon: 115.2167, image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=700&q=85" },
  { id: "MNL", name: "Manila (MNL)", description: "Philippines", lat: 14.5995, lon: 120.9842, image: "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=700&q=85" },
  { id: "HKG", name: "Hong Kong (HKG)", description: "Hong Kong", lat: 22.3193, lon: 114.1694, image: "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?auto=format&fit=crop&w=700&q=85" },
  { id: "TPE", name: "Taipei (TPE)", description: "Taiwan", lat: 25.033, lon: 121.5654, image: "https://images.unsplash.com/photo-1470004914212-05527e49370b?auto=format&fit=crop&w=700&q=85" },
  { id: "CAN", name: "Guangzhou (CAN)", description: "China", lat: 23.1291, lon: 113.2644, image: "https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?auto=format&fit=crop&w=700&q=85" },
  { id: "ICN", name: "Seoul (ICN)", description: "South Korea", lat: 37.5665, lon: 126.978, image: "https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=700&q=85" },
  { id: "NRT", name: "Tokyo (NRT)", description: "Japan", lat: 35.6762, lon: 139.6503, image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=700&q=85" },
  { id: "KIX", name: "Osaka (KIX)", description: "Japan", lat: 34.6937, lon: 135.5023, image: "https://images.unsplash.com/photo-1590559899731-a382839e5549?auto=format&fit=crop&w=700&q=85" },
  { id: "DXB", name: "Dubai (DXB)", description: "United Arab Emirates", lat: 25.2048, lon: 55.2708, image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=700&q=85" },
  { id: "IST", name: "Istanbul (IST)", description: "Turkey", lat: 41.0082, lon: 28.9784, image: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=700&q=85" },
  { id: "LHR", name: "London (LHR)", description: "United Kingdom", lat: 51.5074, lon: -0.1278, image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=700&q=85" },
  { id: "CDG", name: "Paris (CDG)", description: "France", lat: 48.8566, lon: 2.3522, image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=700&q=85" },
  { id: "SYD", name: "Sydney (SYD)", description: "Australia", lat: -33.8688, lon: 151.2093, image: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=700&q=85" },
];

// Curated connecting hubs for the cheapest-route finder. A round trip via a hub
// is priced as RT(origin↔hub) + RT(hub↔destination): the four one-way segments of
// those two round trips together fly origin→hub→destination and back, so only
// round-trip pricing (which Google Travel Explore supports for any airport) is needed.
const ROUTE_HUBS = [
  { id: "SIN", name: "Singapore (SIN)", lat: 1.3521, lon: 103.8198 },
  { id: "BKK", name: "Bangkok (BKK)", lat: 13.7563, lon: 100.5018 },
  { id: "HKG", name: "Hong Kong (HKG)", lat: 22.3193, lon: 114.1694 },
  { id: "DXB", name: "Dubai (DXB)", lat: 25.2048, lon: 55.2708 },
  { id: "DOH", name: "Doha (DOH)", lat: 25.2854, lon: 51.531 },
  { id: "IST", name: "Istanbul (IST)", lat: 41.0082, lon: 28.9784 },
];

// Short-lived in-memory cache so repeated route scans (and shared legs across
// origins/hubs) do not re-spend SerpApi quota within a session.
const LEG_CACHE_TTL_MS = 10 * 60 * 1000;
const legCache = new Map();

// Successful SerpApi payloads are cached by request (minus the key) so refreshing,
// toggling filters, or re-running a search does not re-spend the monthly quota.
const SERPAPI_CACHE_TTL_MS = 10 * 60 * 1000;
const SERPAPI_CACHE_MAX_ENTRIES = 300;
const serpApiCache = new Map();
const cacheStats = { hits: 0, misses: 0 };

async function fetchSerpApi(params, timeoutMs) {
  const cacheParams = new URLSearchParams(params);
  cacheParams.delete("api_key");
  cacheParams.sort();
  const cacheKey = cacheParams.toString();
  const cached = serpApiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SERPAPI_CACHE_TTL_MS) {
    cacheStats.hits += 1;
    return { ok: true, status: 200, payload: cached.payload, cached: true };
  }
  cacheStats.misses += 1;
  const apiResponse = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
  const responseText = await apiResponse.text();
  let payload = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    // Callers decide how to report an unparseable response.
  }
  if (apiResponse.ok && payload && !payload.error) {
    serpApiCache.delete(cacheKey);
    serpApiCache.set(cacheKey, { at: Date.now(), payload });
    // Map iteration order is insertion order, so the first key is the oldest entry.
    while (serpApiCache.size > SERPAPI_CACHE_MAX_ENTRIES) serpApiCache.delete(serpApiCache.keys().next().value);
  }
  return { ok: apiResponse.ok, status: apiResponse.status, payload, cached: false };
}

function sendJson(response, status, body) {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(date) {
  return daysBetween(isoToday(), date);
}

async function fetchWeather(deal) {
  const startDate = deal.date?.slice(0, 10);
  const endDate = deal.date?.slice(-10);
  const withinForecast = startDate && endDate && daysFromToday(startDate) >= 0 && daysFromToday(endDate) <= 16;
  if (!withinForecast || !Number.isFinite(deal.lat) || !Number.isFinite(deal.lon)) {
    return { available: false, reason: "Forecast only available up to 16 days ahead" };
  }
  const params = new URLSearchParams({
    latitude: String(deal.lat),
    longitude: String(deal.lon),
    start_date: startDate,
    end_date: endDate,
    daily: "precipitation_sum,precipitation_probability_max",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) return { available: false, reason: "Weather request failed" };
  const payload = await response.json();
  const precipitation = payload.daily?.precipitation_sum || [];
  const dryDays = precipitation.filter((amount) => Number(amount) < 1).length;
  const totalDays = precipitation.length;
  return totalDays ? {
    available: true,
    dryDays,
    totalDays,
    dryPercent: Math.round((dryDays / totalDays) * 100),
    maxRainChance: Math.max(...(payload.daily?.precipitation_probability_max || [0]).map(Number)),
    source: "Open-Meteo",
  } : { available: false, reason: "Forecast unavailable" };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await mapper(items[index], index);
      } catch {
        results[index] = { available: false, reason: "Weather request failed" };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function settleWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function fetchOriginDeals(origin, stops, outboundDate, returnDate, maxPrice, month, travelDuration, arrival) {
  const params = new URLSearchParams({
    engine: "google_travel_explore",
    api_key: apiKey,
    departure_id: origin,
    currency: "MYR",
    hl: "en",
    gl: "my",
  });
  if (arrival?.id) params.set(arrival.type === "region" ? "arrival_area_id" : "arrival_id", arrival.id);
  if (stops && stops !== "any") params.set("stops", stops);
  if (outboundDate && returnDate) {
    params.set("type", "1");
    params.set("outbound_date", outboundDate);
    params.set("return_date", returnDate);
  }
  if (maxPrice) params.set("max_price", String(maxPrice));
  if (month) params.set("month", String(month));
  if (travelDuration) params.set("travel_duration", String(travelDuration));

  const { ok, payload } = await fetchSerpApi(params, 25000);
  if (!payload) {
    throw new Error(`SerpApi returned an invalid response for ${origin}.`);
  }
  if (payload.error && /empty results for departure_id/i.test(payload.error)) {
    return { origin, travelDuration, deals: [], empty: true };
  }
  if (!ok || payload.error) {
    throw new Error(payload.error || `Live search failed for ${origin}.`);
  }
  if (Array.isArray(payload.destinations)) {
    return {
      origin,
      travelDuration,
      deals: payload.destinations.map((item, index) => mapDestination(item, index, origin, outboundDate, returnDate)),
      empty: payload.destinations.length === 0,
    };
  }
  if (arrival && Array.isArray(payload.flights)) {
    return {
      origin,
      travelDuration,
      deals: payload.flights.map((item, index) => mapSpecificFlight(item, index, origin, outboundDate, returnDate, arrival, payload.google_flights_link, travelDuration, payload.start_date, payload.end_date)),
      empty: payload.flights.length === 0,
    };
  }
  const deals = (payload.results || []).map((item, index) => mapDestination(item, index, origin, outboundDate, returnDate));
  return { origin, travelDuration, deals, empty: deals.length === 0 };
}

function enrichFallbackDeal(deal, arrival) {
  return {
    ...deal,
    city: arrival.name,
    country: arrival.description,
    lat: arrival.lat,
    lon: arrival.lon,
    image: arrival.image || deal.image,
    fallbackDestinationId: arrival.id,
  };
}

async function fetchWorldwideFallbackDeals(origins, durationGroups, stops, outboundDate, returnDate, maxPrice, month) {
  const tasks = WORLDWIDE_FALLBACK_DESTINATIONS.flatMap((arrival) =>
    origins.flatMap((origin) =>
      durationGroups.map((duration) => async () => {
        const result = await fetchOriginDeals(origin, stops, outboundDate, returnDate, maxPrice, month, duration, { ...arrival, type: "airport" });
        return {
          ...result,
          deals: result.deals.map((deal) => enrichFallbackDeal(deal, arrival)),
        };
      })
    )
  );
  return settleWithConcurrency(tasks, 6);
}

// Price one round-trip point-to-point leg with the Google Flights engine, which —
// unlike Google Travel Explore — returns fares for a specific departure→arrival pair.
async function fetchPointToPoint(departureId, arrivalId, outboundDate, returnDate, stops) {
  const params = new URLSearchParams({
    engine: "google_flights",
    api_key: apiKey,
    departure_id: departureId,
    arrival_id: arrivalId,
    outbound_date: outboundDate,
    return_date: returnDate,
    currency: "MYR",
    hl: "en",
    gl: "my",
    type: "1",
  });
  if (stops && stops !== "any") params.set("stops", stops);
  const { payload } = await fetchSerpApi(params, 25000);
  if (!payload || payload.error) return [];
  const offers = [...(payload.best_flights || []), ...(payload.other_flights || [])];
  return offers.map((item) => {
    const segments = item.flights || [];
    return {
      price: parsePrice(item.price),
      airline: segments[0]?.airline || "Airline not provided",
      airlineCode: String(segments[0]?.flight_number || "").split(" ")[0] || "",
      stops: Math.max(0, segments.length - 1),
    };
  }).filter((offer) => offer.price > 0);
}

// Price one round-trip leg (departure → arrival) and return the cheapest offer.
// Results are cached by leg + dates + stops so shared legs are only fetched once.
async function priceLeg(departureId, arrival, outboundDate, returnDate, stops) {
  const cacheKey = `${departureId}>${arrival.id}|${outboundDate}|${returnDate}|${stops || "any"}`;
  const cached = legCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LEG_CACHE_TTL_MS) return cached.value;

  const offers = await fetchPointToPoint(departureId, arrival.id, outboundDate, returnDate, stops);
  const cheapest = offers.sort((a, b) => a.price - b.price)[0] || null;
  const value = cheapest
    ? { price: cheapest.price, airline: cheapest.airline, airlineCode: cheapest.airlineCode, stops: cheapest.stops, date: `${outboundDate} – ${returnDate}`, link: googleFlightsUrl(departureId, arrival.id, outboundDate, returnDate), available: true }
    : { available: false };
  legCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

// Find the cheapest way to reach a destination: compare direct round trips from
// each origin against one-hub connections, ranked by total price with savings.
async function findRoutes(origins, destination, outboundDate, returnDate, stops, hubs) {
  const candidateHubs = hubs.filter((hub) => hub.id !== destination.id && !origins.includes(hub.id));

  // Collect every distinct leg the routes need, price them once (cache-backed), then assemble.
  const legSpecs = new Map();
  const addLeg = (dep, arr) => { legSpecs.set(`${dep}>${arr.id}`, { dep, arr }); };
  for (const origin of origins) {
    addLeg(origin, destination);
    for (const hub of candidateHubs) {
      addLeg(origin, hub);
      addLeg(hub.id, destination);
    }
  }
  const specs = [...legSpecs.entries()];
  const settled = await settleWithConcurrency(specs.map(([, spec]) => () => priceLeg(spec.dep, spec.arr, outboundDate, returnDate, stops)), 4);
  const legPrices = new Map();
  specs.forEach(([key], index) => {
    legPrices.set(key, settled[index].status === "fulfilled" ? settled[index].value : { available: false });
  });
  const leg = (dep, arrId) => legPrices.get(`${dep}>${arrId}`) || { available: false };

  return { ...assembleRoutes(origins, destination, candidateHubs, leg), hubsScanned: candidateHubs.length };
}

async function routeFinder(requestUrl, response) {
  if (!apiKey) {
    return sendJson(response, 503, { error: "Live API is ready, but SERPAPI_KEY has not been configured." });
  }
  const origin = requestUrl.searchParams.get("origin") || "ALL";
  const stops = requestUrl.searchParams.get("stops");
  if (!["ALL", "PEN", "KUL"].includes(origin) || !["any", "1", "2", "3", null].includes(stops)) {
    return sendJson(response, 400, { error: "Choose a valid airport and stops filter." });
  }
  const arrivalId = requestUrl.searchParams.get("arrivalId");
  const arrivalName = requestUrl.searchParams.get("arrivalName");
  const arrivalDescription = requestUrl.searchParams.get("arrivalDescription") || "";
  if (!arrivalId || !arrivalName || !/^[A-Z]{3}$/.test(arrivalId)) {
    return sendJson(response, 400, { error: "The route finder needs a specific destination airport (3-letter code)." });
  }
  const outboundDate = requestUrl.searchParams.get("outboundDate");
  const returnDate = requestUrl.searchParams.get("returnDate");
  if (!outboundDate || !returnDate || returnDate <= outboundDate) {
    return sendJson(response, 400, { error: "The route finder needs specific departure and return dates." });
  }
  const requestedHubs = String(requestUrl.searchParams.get("hubs") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const hubs = (requestedHubs.length ? ROUTE_HUBS.filter((hub) => requestedHubs.includes(hub.id)) : ROUTE_HUBS).slice(0, 6);
  const origins = origin === "ALL" ? ["PEN", "KUL"] : [origin];
  const destination = { id: arrivalId, name: arrivalName, description: arrivalDescription };

  try {
    const { routes, cheapestDirect, hubsScanned } = await findRoutes(origins, destination, outboundDate, returnDate, stops, hubs);
    const message = routes.length === 0
      ? `No routes to ${arrivalName} were found for ${outboundDate} to ${returnDate}. Try other dates or a wider stops filter.`
      : null;
    return sendJson(response, 200, {
      routes,
      cheapestDirect,
      destination,
      searchedOrigins: origins,
      hubsScanned,
      dates: [outboundDate, returnDate],
      message,
      retrievedAt: new Date().toISOString(),
      source: "SerpApi Google Travel Explore route scan",
      disclaimer: "Connecting routes are separate tickets: allow a long layover, re-check baggage, and confirm any transit-visa rules before booking.",
    });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "The route finder hit an error. Please try again." });
  }
}

async function searchLocations(requestUrl, response) {
  if (!apiKey) {
    return sendJson(response, 503, { error: "Live API is ready, but SERPAPI_KEY has not been configured." });
  }
  const query = String(requestUrl.searchParams.get("q") || "").trim();
  if (query.length < 2) return sendJson(response, 200, { suggestions: [] });
  if (query.length > 80) return sendJson(response, 400, { error: "Destination search is too long." });
  const params = new URLSearchParams({
    engine: "google_flights_autocomplete",
    api_key: apiKey,
    q: query,
    hl: "en",
    gl: "my",
  });
  const { ok, payload } = await fetchSerpApi(params, 12000);
  if (!ok || !payload || payload.error) {
    return sendJson(response, 502, { error: payload?.error || "Worldwide destination search failed." });
  }
  const suggestions = (payload.suggestions || []).flatMap((item) =>
    (item.airports || []).map((airport) => ({
      id: String(airport.id || ""),
      name: `${airport.id} – ${airport.name}`,
      type: "airport",
      description: String(item.name || airport.city || "Airport"),
    }))
  ).filter((item) => /^[A-Z]{3}$/.test(item.id) && item.name).slice(0, 8);
  return sendJson(response, 200, { suggestions, source: "SerpApi Google Flights Autocomplete" });
}

async function exploreFlights(requestUrl, response) {
  if (!apiKey) {
    return sendJson(response, 503, { error: "Live API is ready, but SERPAPI_KEY has not been configured." });
  }
  const origin = requestUrl.searchParams.get("origin") || "ALL";
  const stops = requestUrl.searchParams.get("stops");
  if (!["ALL", "PEN", "KUL"].includes(origin) || !["any", "1", "2", "3", null].includes(stops)) {
    return sendJson(response, 400, { error: "Choose a valid airport and stops filter." });
  }
  const minPrice = Number(requestUrl.searchParams.get("minPrice") || 0);
  const maxPrice = Number(requestUrl.searchParams.get("maxPrice") || 3000);
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice < 0 || minPrice >= maxPrice) {
    return sendJson(response, 400, { error: "Choose a valid minimum and maximum fare." });
  }
  const outboundDate = requestUrl.searchParams.get("outboundDate");
  const returnDate = requestUrl.searchParams.get("returnDate");
  const arrivalId = requestUrl.searchParams.get("arrivalId");
  const arrivalType = requestUrl.searchParams.get("arrivalType");
  const arrivalName = requestUrl.searchParams.get("arrivalName");
  const arrivalDescription = requestUrl.searchParams.get("arrivalDescription");
  const arrival = arrivalId && arrivalName ? { id: arrivalId, type: arrivalType || "city", name: arrivalName, description: arrivalDescription || "" } : null;
  if ((arrivalId && !arrivalName) || (arrivalName && !arrivalId) || (arrival && !/^(\/[mg]\/|[A-Z]{3}$)/.test(arrival.id))) {
    return sendJson(response, 400, { error: "Choose a valid worldwide destination." });
  }
  const travelMonth = requestUrl.searchParams.get("travelMonth");
  const minTripDays = Number(requestUrl.searchParams.get("minTripDays") || 0);
  const maxTripDays = Number(requestUrl.searchParams.get("maxTripDays") || 0);
  if ((outboundDate && !returnDate) || (!outboundDate && returnDate) || (outboundDate && returnDate && returnDate <= outboundDate)) {
    return sendJson(response, 400, { error: "Choose a valid departure and return date." });
  }
  if (travelMonth && (!Number.isInteger(minTripDays) || !Number.isInteger(maxTripDays) || minTripDays < 2 || maxTripDays > 21 || minTripDays > maxTripDays)) {
    return sendJson(response, 400, { error: "Choose a valid trip range from 2 to 21 days." });
  }
  const month = travelMonth ? Number(travelMonth.split("-")[1]) : 0;
  const durationGroups = travelMonth ? durationGroupsFor(minTripDays, maxTripDays) : [null];
  const origins = origin === "ALL" ? ["PEN", "KUL"] : [origin];
  const searches = origins.flatMap((code) => durationGroups.map((duration) => fetchOriginDeals(code, stops, outboundDate, returnDate, maxPrice, month, duration, arrival)));
  const results = await Promise.allSettled(searches);
  let fulfilled = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  let successful = fulfilled.flatMap((result) => result.deals);
  if (fulfilled.length === 0) {
    const reason = results.find((result) => result.status === "rejected")?.reason?.message;
    return sendJson(response, 502, { error: reason || "Live fare search failed. Please try again." });
  }

  let fallbackUsed = false;
  let fallbackResults = [];
  // Targeted flexible searches use Google's duration buckets, which can return
  // exact dates slightly outside the requested custom range. Keep them for a
  // user-selected airport, but enforce the custom range for worldwide scans.
  let deals = collapseDeals(successful, {
    travelMonth,
    allowApproximateTripRange: Boolean(travelMonth && arrival),
    minTripDays,
    maxTripDays,
    minPrice,
    maxPrice,
  });

  if (!arrival && deals.length === 0) {
    fallbackResults = await fetchWorldwideFallbackDeals(origins, durationGroups, stops, outboundDate, returnDate, maxPrice, month);
    const fallbackFulfilled = fallbackResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
    const fallbackSuccessful = fallbackFulfilled.flatMap((result) => result.deals);
    if (fallbackFulfilled.length) {
      fallbackUsed = true;
      fulfilled = fallbackFulfilled;
      successful = fallbackSuccessful;
      deals = collapseDeals(successful, {
        travelMonth,
        allowApproximateTripRange: false,
        minTripDays,
        maxTripDays,
        minPrice,
        maxPrice,
      });
    }
  }

  const includeWeather = requestUrl.searchParams.get("weather") === "true";
  const minDryPercent = Number(requestUrl.searchParams.get("minDryPercent") || 80);
  if (includeWeather && deals.length) {
    const forecasts = await mapWithConcurrency(deals, 6, fetchWeather);
    deals = deals.map((deal, index) => ({ ...deal, weather: forecasts[index] }));
  }

  const emptyOrigins = origins.filter((code) => !successful.some((deal) => deal.origin === code));
  const warnings = [...results, ...fallbackResults].filter((result) => result.status === "rejected").map((result) => result.reason?.message);
  const originLabel = origin === "ALL" ? "Penang or Kuala Lumpur" : origin;
  const dateLabel = travelMonth
    ? `${travelMonth} for trips of ${minTripDays} to ${maxTripDays} days`
    : outboundDate && returnDate
      ? `${outboundDate} to ${returnDate}`
      : "the selected filters";
  const message = deals.length === 0
    ? `No live ${arrival ? `fares to ${arrival.name}` : "worldwide fares"} are currently available from ${originLabel} for ${dateLabel}${fallbackUsed ? " after scanning popular destination airports" : ""}. Try another month, Anytime, Specific dates, or a wider fare range.`
    : null;

  return sendJson(response, 200, {
    deals,
    message,
    source: fallbackUsed ? "SerpApi Google Travel Explore route scan" : "SerpApi Google Travel Explore",
    retrievedAt: new Date().toISOString(),
    searchedOrigins: origins,
    emptyOrigins,
    fallbackUsed,
    fallbackDestinationsScanned: fallbackUsed ? WORLDWIDE_FALLBACK_DESTINATIONS.length : 0,
    selectedDestination: arrival,
    fareRange: [minPrice, maxPrice],
    searchedMonth: travelMonth || null,
    tripDayRange: travelMonth ? [minTripDays, maxTripDays] : null,
    tripDayRangeApproximate: Boolean(travelMonth && arrival && !fallbackUsed),
    weatherRequested: includeWeather,
    weatherSource: includeWeather ? "Open-Meteo" : null,
    warnings,
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/status") {
      return sendJson(response, 200, {
        ok: true,
        keyConfigured: Boolean(apiKey),
        provider: "SerpApi Google Travel Explore",
        serverTime: new Date().toISOString(),
        cache: { entries: serpApiCache.size, hits: cacheStats.hits, misses: cacheStats.misses, ttlMinutes: SERPAPI_CACHE_TTL_MS / 60000 },
      });
    }
    if (url.pathname === "/api/flights/locations") return await searchLocations(url, response);
    if (url.pathname === "/api/flights/explore") return await exploreFlights(url, response);
    if (url.pathname === "/api/flights/route") return await routeFinder(url, response);

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const path = normalize(join(root, requested));
    if (!path.startsWith(root)) return sendJson(response, 403, { error: "Forbidden" });
    await stat(path);
    // Vite fingerprints everything under /assets/, so those files can be cached for good.
    const cacheControl = requested.startsWith("/assets/index-") ? "public, max-age=31536000, immutable" : "no-store";
    response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": cacheControl });
    response.end(await readFile(path));
  } catch (error) {
    if (request.url?.startsWith("/api/")) {
      console.error("API request failed:", error);
      return sendJson(response, 500, { error: "The flight API server hit an unexpected error. Please try again." });
    }
    try {
      response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(await readFile(join(root, "index.html")));
    } catch {
      sendJson(response, 404, { error: "Not found" });
    }
  }
});

server.on("error", (error) => {
  console.error("Global Radar server error:", error);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Global Radar is running at http://127.0.0.1:${port}`);
  console.log(apiKey ? "SerpApi live fares enabled." : "Demo mode: set SERPAPI_KEY to enable live fares.");
});
