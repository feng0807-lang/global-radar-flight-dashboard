import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

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
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function parsePrice(value) {
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
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

function mapDestination(item, index, origin, requestedOutboundDate, requestedReturnDate) {
  const rawLatitude = Number(item.gps_coordinates?.latitude);
  const rawLongitude = Number(item.gps_coordinates?.longitude);
  const latitude = Number.isFinite(rawLatitude) ? rawLatitude : null;
  const longitude = Number.isFinite(rawLongitude) ? rawLongitude : null;
  const price = parsePrice(item.flight_price ?? item.price);
  const flightDates = item.flight_dates || {};
  const startDate = requestedOutboundDate || item.start_date || flightDates.departure;
  const endDate = requestedReturnDate || item.end_date || flightDates.return;
  return {
    id: `live-${origin}-${index}-${item.name || item.city || "destination"}`,
    city: String(item.name || item.city || "Explore destination"),
    country: String(item.country || item.description || "Explore destination"),
    price,
    origin: origin === "ALL" ? "PEN / KUL" : origin,
    date: startDate && endDate ? `${startDate} – ${endDate}` : "Dates unavailable",
    hasExactDates: Boolean(startDate && endDate),
    days: daysBetween(startDate, endDate) || Number(item.duration ?? 7),
    stops: Number(item.number_of_stops ?? 0),
    airline: String(item.airline || "Airline not provided"),
    airlineCode: String(item.airline_code || ""),
    theme: "Live",
    lat: latitude,
    lon: longitude,
    accent: price < 900 ? "gold" : price < 1600 ? "teal" : "coral",
    image: item.thumbnail || "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=700&q=85",
    link: item.link || null,
  };
}

function tripDaysForDurationGroup(travelDuration) {
  return travelDuration === 1 ? 3 : travelDuration === 3 ? 14 : 7;
}

function mapSpecificFlight(item, index, origin, requestedOutboundDate, requestedReturnDate, arrival, fallbackLink, travelDuration, flexibleStartDate, flexibleEndDate) {
  const price = parsePrice(item.flight_price ?? item.price);
  const startDate = item.start_date || requestedOutboundDate || flexibleStartDate;
  const endDate = item.end_date || requestedReturnDate || flexibleEndDate;
  return {
    id: `live-${origin}-${index}-${arrival.id}`,
    city: arrival.name,
    country: arrival.description || "Selected airport",
    price,
    origin,
    date: startDate && endDate ? `${startDate} – ${endDate}` : "Flexible dates",
    hasExactDates: Boolean(startDate && endDate),
    // Targeted Explore flights report `duration` as flight time in minutes, not trip length.
    days: daysBetween(startDate, endDate) || tripDaysForDurationGroup(travelDuration),
    stops: Number(item.number_of_stops ?? 0),
    airline: String(item.airline || "Airline not provided"),
    airlineCode: String(item.airline_code || ""),
    theme: "Live",
    lat: null,
    lon: null,
    accent: price < 900 ? "gold" : price < 1600 ? "teal" : "coral",
    image: item.thumbnail || "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=700&q=85",
    link: item.link || fallbackLink || null,
  };
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

  const apiResponse = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(25000) });
  const responseText = await apiResponse.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`SerpApi returned an invalid response for ${origin}.`);
  }
  if (!apiResponse.ok || payload.error) {
    throw new Error(payload.error || `Live search failed for ${origin}.`);
  }
  if (Array.isArray(payload.destinations)) {
    return payload.destinations.map((item, index) => mapDestination(item, index, origin, outboundDate, returnDate));
  }
  if (arrival && Array.isArray(payload.flights)) {
    return payload.flights.map((item, index) => mapSpecificFlight(item, index, origin, outboundDate, returnDate, arrival, payload.google_flights_link, travelDuration, payload.start_date, payload.end_date));
  }
  return (payload.results || []).map((item, index) => mapDestination(item, index, origin, outboundDate, returnDate));
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
  const apiResponse = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(12000) });
  const payload = await apiResponse.json();
  if (!apiResponse.ok || payload.error) {
    return sendJson(response, 502, { error: payload.error || "Worldwide destination search failed." });
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
  const durationGroups = travelMonth
    ? [
        ...(minTripDays <= 4 ? [1] : []),
        ...(minTripDays <= 10 && maxTripDays >= 5 ? [2] : []),
        ...(maxTripDays >= 11 ? [3] : []),
      ]
    : [null];
  const origins = origin === "ALL" ? ["PEN", "KUL"] : [origin];
  const searches = origins.flatMap((code) => durationGroups.map((duration) => fetchOriginDeals(code, stops, outboundDate, returnDate, maxPrice, month, duration, arrival)));
  const results = await Promise.allSettled(searches);
  const successful = results.filter((result) => result.status === "fulfilled").flatMap((result) => result.value);
  if (successful.length === 0) {
    const reason = results.find((result) => result.status === "rejected")?.reason?.message;
    return sendJson(response, 502, { error: reason || "Live fare search failed. Please try again." });
  }

  const cheapestByCity = new Map();
  // Targeted flexible searches use Google's duration buckets, which can return
  // exact dates slightly outside the requested custom range. Keep them and show
  // their real dates instead of inventing a trip length.
  const eligible = successful.filter((item) => !travelMonth || arrival || (item.days >= minTripDays && item.days <= maxTripDays));
  for (const deal of eligible) {
    const cityOffers = cheapestByCity.get(deal.city) || new Map();
    const existingOrigin = cityOffers.get(deal.origin);
    if (!existingOrigin || deal.price < existingOrigin.price) cityOffers.set(deal.origin, deal);
    cheapestByCity.set(deal.city, cityOffers);
  }
  let deals = [...cheapestByCity.values()].map((cityOffers) => {
    const options = [...cityOffers.values()].sort((a, b) => a.price - b.price);
    const cheapest = options[0];
    const origins = options.map((option) => option.origin);
    return {
      ...cheapest,
      id: `live-${cheapest.city}`,
      origin: origins.length > 1 ? "BOTH" : origins[0],
      origins,
      originOptions: options.map((option) => ({
        origin: option.origin,
        price: option.price,
        airline: option.airline,
        airlineCode: option.airlineCode,
        link: option.link,
        date: option.date,
        days: option.days,
        stops: option.stops,
      })),
    };
  })
    .filter((item) => item.hasExactDates)
    .filter((item) => item.price >= minPrice && item.price <= maxPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 30);

  const includeWeather = requestUrl.searchParams.get("weather") === "true";
  const minDryPercent = Number(requestUrl.searchParams.get("minDryPercent") || 80);
  if (includeWeather && deals.length) {
    const forecasts = await mapWithConcurrency(deals, 6, fetchWeather);
    deals = deals.map((deal, index) => ({ ...deal, weather: forecasts[index] }));
  }

  return sendJson(response, 200, {
    deals,
    source: "SerpApi Google Travel Explore",
    retrievedAt: new Date().toISOString(),
    searchedOrigins: origins,
    selectedDestination: arrival,
    fareRange: [minPrice, maxPrice],
    searchedMonth: travelMonth || null,
    tripDayRange: travelMonth ? [minTripDays, maxTripDays] : null,
    tripDayRangeApproximate: Boolean(travelMonth && arrival),
    weatherRequested: includeWeather,
    weatherSource: includeWeather ? "Open-Meteo" : null,
    warnings: results.filter((result) => result.status === "rejected").map((result) => result.reason?.message),
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
      });
    }
    if (url.pathname === "/api/flights/locations") return await searchLocations(url, response);
    if (url.pathname === "/api/flights/explore") return await exploreFlights(url, response);

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const path = normalize(join(root, requested));
    if (!path.startsWith(root)) return sendJson(response, 403, { error: "Forbidden" });
    await stat(path);
    response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(path));
  } catch (error) {
    if (request.url?.startsWith("/api/")) {
      console.error("API request failed:", error);
      return sendJson(response, 500, { error: "The flight API server hit an unexpected error. Please try again." });
    }
    try {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
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
