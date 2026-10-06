import { test } from "node:test";
import assert from "node:assert/strict";
import { activeFilterCount, DEFAULT_FLIGHT_FILTERS, filterAndSortFlights, flightFacets, formatClock, formatDuration, isRedEye } from "./flightFilters.js";
import { normalizeFlightResults } from "../lib/flightSearch.mjs";
import { googleFlightsPayload } from "../lib/fixtures/googleFlights.mjs";

const kul = normalizeFlightResults(googleFlightsPayload({ from: "KUL" }), "KUL").flights;
const pen = normalizeFlightResults(googleFlightsPayload({ from: "PEN" }), "PEN").flights;
const flights = [...kul, ...pen];
const run = (filters, sort) => filterAndSortFlights(flights, { ...DEFAULT_FLIGHT_FILTERS, ...filters }, sort);
const numbers = (list) => list.map((flight) => flight.legs.map((leg) => leg.flightNumber).join("+"));

test("no filters keeps every flight", () => {
  assert.equal(run({}).length, 12);
});

test("stops filter caps the number of connections", () => {
  assert.ok(run({ maxStops: "0" }).every((flight) => flight.stops === 0));
  assert.equal(run({ maxStops: "0" }).length, 4);
  assert.ok(run({ maxStops: "1" }).every((flight) => flight.stops <= 1));
  assert.equal(run({ maxStops: "1" }).length, 10);
});

test("airline, origin, and connecting-airport exclusions", () => {
  assert.ok(run({ excludedAirlines: ["AirAsia X"] }).every((flight) => !flight.airlines.includes("AirAsia X")));
  // A multi-airline itinerary is hidden if any of its airlines is excluded.
  assert.ok(!run({ excludedAirlines: ["EVA Air"] }).some((flight) => flight.airlines.includes("Thai AirAsia")));
  assert.ok(run({ excludedOrigins: ["PEN"] }).every((flight) => flight.origin === "KUL"));
  assert.ok(run({ excludedLayoverAirports: ["SIN"] }).every((flight) => !flight.layovers.some((layover) => layover.airport === "SIN")));
});

test("time windows, red-eye, and duration limits", () => {
  const morning = run({ departWindow: [6 * 60, 12 * 60] });
  assert.ok(morning.length > 0 && morning.every((flight) => flight.departMinutes >= 360 && flight.departMinutes <= 720));
  const noRedEye = run({ avoidRedEye: true });
  assert.ok(noRedEye.every((flight) => flight.departMinutes >= 5 * 60 && flight.departMinutes < 22 * 60), "late-night and small-hours departures removed");
  assert.ok(!noRedEye.some((flight) => flight.legs[0].flightNumber === "D7 522"), "the 23:45 overnight flight is a red-eye");
  assert.ok(isRedEye({ departMinutes: 12 * 60, legs: [{ overnight: true }] }), "a leg Google marks overnight counts");
  assert.ok(!isRedEye({ departMinutes: 8 * 60, legs: [{}] }));
  assert.ok(run({ arriveWindow: [17 * 60, 20 * 60] }).every((flight) => flight.arriveMinutes >= 1020 && flight.arriveMinutes <= 1200));
  assert.ok(run({ maxDuration: 8 * 60 }).every((flight) => flight.totalDuration <= 480));
});

test("layover limits guard against tight and long connections", () => {
  const safe = run({ minLayover: 45 });
  assert.ok(!safe.some((flight) => flight.layovers.some((layover) => layover.duration < 45)), "30-minute BKK connection removed");
  assert.ok(safe.some((flight) => flight.stops === 0), "direct flights have no layovers to fail");
  assert.ok(run({ maxLayover: 120 }).every((flight) => flight.layovers.every((layover) => layover.duration <= 120)));
  assert.ok(run({ avoidOvernightLayovers: true }).every((flight) => !flight.overnightLayover));
});

test("price, reliability, and emissions filters", () => {
  assert.ok(run({ maxPrice: 1000 }).every((flight) => flight.price <= 1000));
  assert.ok(run({ hideOftenDelayed: true }).every((flight) => !flight.oftenDelayed));
  assert.ok(run({ lowerEmissionsOnly: true }).every((flight) => flight.emissionsDiffPercent < 0));
});

test("sorts", () => {
  const prices = run({}, "cheapest").map((flight) => flight.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const durations = run({}, "fastest").map((flight) => flight.totalDuration);
  assert.deepEqual(durations, [...durations].sort((a, b) => a - b));
  const departs = run({}, "departEarly").map((flight) => flight.departMinutes);
  assert.deepEqual(departs, [...departs].sort((a, b) => a - b));
  assert.ok(run({}, "best").slice(0, 6).every((flight) => flight.category === "best"));
  // The red-eye arrives the next morning, so it sorts after same-day arrivals.
  assert.notEqual(numbers(run({}, "arriveEarly"))[0], "D7 522");
});

test("facets describe what the filter panel can offer", () => {
  const facets = flightFacets(flights);
  assert.equal(facets.airlines[0].minPrice, Math.min(...flights.map((flight) => flight.price)));
  assert.ok(facets.airlines.some((airline) => airline.name === "EVA Air"));
  assert.deepEqual(facets.origins.map((origin) => origin.code), ["KUL", "PEN"]);
  assert.equal(facets.layoverAirports[0].code, "SIN");
  assert.equal(facets.cheapestByStops[0], 1180);
  assert.ok(facets.price[0] < facets.price[1]);
});

test("activeFilterCount and formatting helpers", () => {
  assert.equal(activeFilterCount(DEFAULT_FLIGHT_FILTERS), 0);
  assert.equal(activeFilterCount({ maxStops: "0", avoidRedEye: true, departWindow: [360, 1440] }), 3);
  assert.equal(formatDuration(425), "7 hr 5 min");
  assert.equal(formatDuration(60), "1 hr");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatClock(390), "06:30");
  assert.equal(formatClock(1440), "23:59");
});
