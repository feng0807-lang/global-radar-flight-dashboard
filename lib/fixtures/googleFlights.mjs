// A SerpApi `google_flights` response shaped like the documented format
// (best_flights / other_flights / layovers / carbon_emissions / price_insights).
// Used by unit tests and local stub servers; never by the app itself.

const LOGO = (code) => `https://www.gstatic.com/flights/airline_logos/70px/${code}.png`;

function leg(from, to, date, depart, arrive, arriveDate, duration, airline, code, number, extra = {}) {
  return {
    departure_airport: { name: `${from} International Airport`, id: from, time: `${date} ${depart}` },
    arrival_airport: { name: `${to} International Airport`, id: to, time: `${arriveDate} ${arrive}` },
    duration,
    airplane: "Airbus A330",
    airline,
    airline_logo: LOGO(code),
    travel_class: "Economy",
    flight_number: `${code} ${number}`,
    legroom: "31 in",
    extensions: ["Average legroom (31 in)", "In-seat USB outlet"],
    ...extra,
  };
}

function option(legs, layovers, price, emissions, extra = {}) {
  const total = legs.reduce((sum, l) => sum + l.duration, 0) + layovers.reduce((sum, l) => sum + l.duration, 0);
  return {
    flights: legs,
    layovers,
    total_duration: total,
    carbon_emissions: { this_flight: emissions * 1000, typical_for_this_route: 300000, difference_percent: Math.round((emissions * 1000 / 300000 - 1) * 100) },
    price,
    type: "Round trip",
    airline_logo: legs[0].airline_logo,
    departure_token: `token-${legs.map((l) => l.flight_number.replace(" ", "")).join("-")}`,
    ...extra,
  };
}

// Outbound options from `from` to `to` on `date` (the next day is `next`).
export function googleFlightsPayload({ from = "KUL", to = "NRT", date = "2026-11-02", next = "2026-11-03", returnLeg = false } = {}) {
  const [a, b] = returnLeg ? [to, from] : [from, to];
  const surcharge = from === "PEN" ? 120 : 0;
  const best = [
    option([leg(a, b, date, "23:45", "07:50", next, 425, "AirAsia X", "D7", 522)], [], 1180 + surcharge, 260),
    option([leg(a, b, date, "10:15", "18:20", date, 425, "Malaysia Airlines", "MH", 88)], [], 1650 + surcharge, 280),
    option([
      leg(a, "SIN", date, "08:00", "09:05", date, 65, "Singapore Airlines", "SQ", 105),
      leg("SIN", b, date, "10:05", "18:05", date, 420, "Singapore Airlines", "SQ", 638),
    ], [{ duration: 60, name: "Singapore Changi Airport", id: "SIN" }], 1420 + surcharge, 310),
  ];
  const other = [
    option([
      leg(a, "HKG", date, "14:20", "18:15", date, 235, "Cathay Pacific", "CX", 722),
      leg("HKG", b, next, "08:50", "13:55", next, 245, "Cathay Pacific", "CX", 500),
    ], [{ duration: 875, name: "Hong Kong International Airport", id: "HKG", overnight: true }], 990 + surcharge, 330),
    option([
      leg(a, "BKK", date, "06:30", "07:35", date, 125, "Thai AirAsia", "FD", 352, { often_delayed_by_over_30_min: true }),
      leg("BKK", "TPE", date, "08:05", "12:45", date, 220, "Thai AirAsia", "FD", 230),
      leg("TPE", b, date, "14:30", "18:55", date, 205, "EVA Air", "BR", 198),
    ], [{ duration: 30, name: "Suvarnabhumi Airport", id: "BKK" }, { duration: 105, name: "Taoyuan International Airport", id: "TPE" }], 860 + surcharge, 360),
    option([
      leg(a, "SIN", date, "19:10", "20:15", date, 65, "Scoot", "TR", 451),
      leg("SIN", b, next, "01:20", "09:05", next, 405, "Scoot", "TR", 808),
    ], [{ duration: 305, name: "Singapore Changi Airport", id: "SIN", overnight: true }], 940 + surcharge, 240),
  ];
  return {
    search_metadata: { status: "Success", google_flights_url: `https://www.google.com/travel/flights?hl=en&curr=MYR&q=${a}%20${b}%20${date}` },
    best_flights: best,
    other_flights: other,
    price_insights: { lowest_price: 860 + surcharge, price_level: "low", typical_price_range: [1100, 1700], price_history: Array.from({ length: 60 }, (_, day) => [1754006400 + day * 86400, 1180 + surcharge + Math.round(220 * Math.sin(day / 7)) + (day > 50 ? -200 : 0)]) },
  };
}
