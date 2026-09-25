// Pure fare-shaping logic shared by the API server. Nothing here performs network
// requests, so it is covered by unit tests (lib/fares.test.mjs).

export function parsePrice(value) {
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
}

export function mapDestination(item, index, origin, requestedOutboundDate, requestedReturnDate) {
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

export function tripDaysForDurationGroup(travelDuration) {
  return travelDuration === 1 ? 3 : travelDuration === 3 ? 14 : 7;
}

export function mapSpecificFlight(item, index, origin, requestedOutboundDate, requestedReturnDate, arrival, fallbackLink, travelDuration, flexibleStartDate, flexibleEndDate) {
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

export function collapseDeals(offers, { travelMonth, allowApproximateTripRange, minTripDays, maxTripDays, minPrice, maxPrice }) {
  const cheapestByCity = new Map();
  const eligible = offers.filter((item) => !travelMonth || allowApproximateTripRange || (item.days >= minTripDays && item.days <= maxTripDays));
  for (const deal of eligible) {
    const cityOffers = cheapestByCity.get(deal.city) || new Map();
    const existingOrigin = cityOffers.get(deal.origin);
    if (!existingOrigin || deal.price < existingOrigin.price) cityOffers.set(deal.origin, deal);
    cheapestByCity.set(deal.city, cityOffers);
  }
  return [...cheapestByCity.values()].map((cityOffers) => {
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
    .filter((item) => item.price > 0 && item.price >= minPrice && item.price <= maxPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 30);
}

export function googleFlightsUrl(departureId, arrivalId, outboundDate, returnDate) {
  const query = `Flights from ${departureId} to ${arrivalId} on ${outboundDate} through ${returnDate}`;
  return `https://www.google.com/travel/flights?hl=en&curr=MYR&q=${encodeURIComponent(query)}`;
}

// Google Travel Explore groups flexible trips into duration buckets
// (1 = weekend, 2 = one week, 3 = two weeks). Pick every bucket that can
// contain a trip within the requested day range.
export function durationGroupsFor(minTripDays, maxTripDays) {
  return [
    ...(minTripDays <= 4 ? [1] : []),
    ...(minTripDays <= 10 && maxTripDays >= 5 ? [2] : []),
    ...(maxTripDays >= 11 ? [3] : []),
  ];
}

// Build direct and one-hub routes from priced legs, ranked by total price with
// savings against the cheapest direct option. `leg(dep, arrId)` returns a priced
// leg ({ available, price, ... }) for a departure → arrival pair.
export function assembleRoutes(origins, destination, candidateHubs, leg) {
  const routes = [];
  for (const origin of origins) {
    const direct = leg(origin, destination.id);
    if (direct.available) {
      routes.push({
        id: `direct-${origin}`,
        type: "direct",
        origin,
        hub: null,
        total: direct.price,
        legs: [{ from: origin, to: destination.id, toName: destination.name, ...direct }],
      });
    }
    for (const hub of candidateHubs) {
      const legOne = leg(origin, hub.id);
      const legTwo = leg(hub.id, destination.id);
      if (legOne.available && legTwo.available) {
        routes.push({
          id: `hub-${origin}-${hub.id}`,
          type: "hub",
          origin,
          hub: { id: hub.id, name: hub.name },
          total: legOne.price + legTwo.price,
          legs: [
            { from: origin, to: hub.id, toName: hub.name, ...legOne },
            { from: hub.id, to: destination.id, toName: destination.name, ...legTwo },
          ],
        });
      }
    }
  }

  const cheapestDirect = routes.filter((route) => route.type === "direct").reduce((min, route) => Math.min(min, route.total), Infinity);
  const ranked = routes
    .map((route) => ({
      ...route,
      savingsVsDirect: Number.isFinite(cheapestDirect) ? cheapestDirect - route.total : null,
    }))
    .sort((a, b) => a.total - b.total)
    .slice(0, 12);

  return { routes: ranked, cheapestDirect: Number.isFinite(cheapestDirect) ? cheapestDirect : null };
}
