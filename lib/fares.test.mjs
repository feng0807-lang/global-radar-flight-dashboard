import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleRoutes, collapseDeals, daysBetween, durationGroupsFor, googleFlightsUrl, mapDestination, mapSpecificFlight, parsePrice } from "./fares.mjs";

test("parsePrice reads formatted fares and falls back to 0", () => {
  assert.equal(parsePrice("MYR 1,234"), 1234);
  assert.equal(parsePrice(899), 899);
  assert.equal(parsePrice(null), 0);
  assert.equal(parsePrice("n/a"), 0);
});

test("daysBetween counts whole days and tolerates missing dates", () => {
  assert.equal(daysBetween("2026-11-02", "2026-11-09"), 7);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("", "2026-11-09"), 0);
});

test("durationGroupsFor picks every Explore bucket that overlaps the trip range", () => {
  assert.deepEqual(durationGroupsFor(4, 10), [1, 2]);
  assert.deepEqual(durationGroupsFor(2, 3), [1]);
  assert.deepEqual(durationGroupsFor(5, 21), [2, 3]);
  assert.deepEqual(durationGroupsFor(11, 14), [3]);
});

test("mapDestination prefers requested dates and derives trip length and accent", () => {
  const deal = mapDestination(
    { name: "Tokyo", country: "Japan", flight_price: "MYR 1,400", start_date: "2026-12-01", end_date: "2026-12-05", gps_coordinates: { latitude: 35.6, longitude: 139.6 } },
    0, "KUL", "2026-11-02", "2026-11-09",
  );
  assert.equal(deal.date, "2026-11-02 – 2026-11-09");
  assert.equal(deal.days, 7);
  assert.equal(deal.price, 1400);
  assert.equal(deal.accent, "teal");
  assert.equal(deal.lat, 35.6);
});

test("mapDestination leaves coordinates empty when the API omits them", () => {
  const deal = mapDestination({ name: "Somewhere", flight_price: 500 }, 3, "PEN");
  assert.equal(deal.lat, null);
  assert.equal(deal.lon, null);
  assert.equal(deal.hasExactDates, false);
  assert.equal(deal.accent, "gold");
});

test("mapSpecificFlight never treats flight minutes as trip length", () => {
  const arrival = { id: "NRT", name: "NRT – Narita", description: "Tokyo" };
  const deal = mapSpecificFlight({ price: 1500, duration: 420 }, 0, "KUL", null, null, arrival, "https://example.test", 2, null, null);
  assert.equal(deal.days, 7);
  assert.equal(deal.link, "https://example.test");
  assert.equal(deal.city, "NRT – Narita");
});

const offer = (city, origin, price, days = 7, date = "2026-11-02 – 2026-11-09") => ({
  city, origin, price, days, date, hasExactDates: Boolean(date), airline: "Test Air", airlineCode: "TA", link: null, stops: 0,
});
const range = { travelMonth: null, allowApproximateTripRange: false, minTripDays: 0, maxTripDays: 0, minPrice: 0, maxPrice: 3000 };

test("collapseDeals merges a city across airports and keeps the cheapest per airport", () => {
  const [tokyo] = collapseDeals([
    offer("Tokyo", "KUL", 1400),
    offer("Tokyo", "KUL", 1300),
    offer("Tokyo", "PEN", 1600),
  ], range);
  assert.equal(tokyo.price, 1300);
  assert.equal(tokyo.origin, "BOTH");
  assert.deepEqual(tokyo.origins, ["KUL", "PEN"]);
  assert.deepEqual(tokyo.originOptions.map((option) => option.price), [1300, 1600]);
});

test("collapseDeals applies the fare range and drops undated or free fares", () => {
  const deals = collapseDeals([
    offer("Cheap", "KUL", 200),
    offer("Pricey", "KUL", 4000),
    offer("Undated", "KUL", 900, 7, null),
    offer("Free", "KUL", 0),
    offer("Fine", "PEN", 900),
  ], { ...range, minPrice: 300 });
  assert.deepEqual(deals.map((deal) => deal.city), ["Fine"]);
});

test("collapseDeals enforces the trip-day range for month searches unless approximate", () => {
  const offers = [offer("Short", "KUL", 500, 3), offer("Right", "KUL", 600, 7)];
  const strict = collapseDeals(offers, { ...range, travelMonth: "2026-11", minTripDays: 5, maxTripDays: 10 });
  assert.deepEqual(strict.map((deal) => deal.city), ["Right"]);
  const approximate = collapseDeals(offers, { ...range, travelMonth: "2026-11", allowApproximateTripRange: true, minTripDays: 5, maxTripDays: 10 });
  assert.deepEqual(approximate.map((deal) => deal.city), ["Short", "Right"]);
});

test("collapseDeals returns at most 30 destinations, cheapest first", () => {
  const offers = Array.from({ length: 40 }, (_, index) => offer(`City ${index}`, "KUL", 2000 - index * 10));
  const deals = collapseDeals(offers, range);
  assert.equal(deals.length, 30);
  assert.equal(deals[0].price, 1610);
});

const legTable = (prices) => (dep, arr) => {
  const price = prices[`${dep}>${arr}`];
  return price ? { available: true, price, airline: "Test Air" } : { available: false };
};
const destination = { id: "LHR", name: "London (LHR)" };
const hubs = [{ id: "DXB", name: "Dubai (DXB)" }, { id: "IST", name: "Istanbul (IST)" }];

test("assembleRoutes ranks hub connections against the cheapest direct fare", () => {
  const { routes, cheapestDirect } = assembleRoutes(["KUL"], destination, hubs, legTable({
    "KUL>LHR": 3000,
    "KUL>DXB": 1000,
    "DXB>LHR": 1500,
    "KUL>IST": 1800,
    // IST>LHR missing: that hub cannot complete a route.
  }));
  assert.equal(cheapestDirect, 3000);
  assert.deepEqual(routes.map((route) => route.id), ["hub-KUL-DXB", "direct-KUL"]);
  assert.equal(routes[0].total, 2500);
  assert.equal(routes[0].savingsVsDirect, 500);
  assert.deepEqual(routes[0].legs.map((leg) => `${leg.from}>${leg.to}`), ["KUL>DXB", "DXB>LHR"]);
});

test("assembleRoutes reports no savings baseline when no direct fare exists", () => {
  const { routes, cheapestDirect } = assembleRoutes(["PEN"], destination, hubs, legTable({ "PEN>IST": 900, "IST>LHR": 1100 }));
  assert.equal(cheapestDirect, null);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].savingsVsDirect, null);
});

test("googleFlightsUrl builds an encoded MYR search", () => {
  const url = new URL(googleFlightsUrl("KUL", "LHR", "2026-11-02", "2026-11-09"));
  assert.equal(url.searchParams.get("curr"), "MYR");
  assert.equal(url.searchParams.get("q"), "Flights from KUL to LHR on 2026-11-02 through 2026-11-09");
});
