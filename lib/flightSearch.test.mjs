import { test } from "node:test";
import assert from "node:assert/strict";
import { aircraftFamily, legAmenities, normalizeFlightResults, parseFlightSearch, serpApiFlightParams } from "./flightSearch.mjs";
import { googleFlightsPayload } from "./fixtures/googleFlights.mjs";

const TODAY = "2026-10-01";
const parse = (query) => parseFlightSearch(new URLSearchParams(query), TODAY);

test("parseFlightSearch accepts a round trip from both home airports", () => {
  const { query, error } = parse("from=ALL&to=nrt&depart=2026-11-02&return=2026-11-09&adults=2&children=1&cabin=3&bags=1");
  assert.equal(error, undefined);
  assert.deepEqual(query.origins, ["PEN", "KUL"]);
  assert.equal(query.to, "NRT");
  assert.equal(query.tripType, "round");
  assert.equal(query.adults, 2);
  assert.equal(query.cabin, 3);
});

test("parseFlightSearch drops the return date for one-way trips", () => {
  const { query } = parse("from=KUL&to=NRT&depart=2026-11-02&return=2026-11-09&trip=oneway");
  assert.equal(query.returnDate, "");
  assert.equal(query.tripType, "oneway");
});

test("parseFlightSearch rejects bad input with a readable message", () => {
  const cases = {
    "from=KUL&to=&depart=2026-11-02&trip=oneway": /destination/i,
    "from=KUL&to=KUL&depart=2026-11-02&trip=oneway": /differ/i,
    "from=KUL&to=NRT&depart=2026-09-01&trip=oneway": /today/i,
    "from=KUL&to=NRT&depart=2026-11-02&return=2026-11-01": /return date/i,
    "from=KUL&to=NRT&depart=2026-11-02&trip=oneway&adults=0": /passengers/i,
    "from=KUL&to=NRT&depart=2026-11-02&trip=oneway&adults=1&infants=2": /infant/i,
    "from=KUL&to=NRT&depart=2026-11-02&trip=oneway&adults=6&children=4": /9 passengers/i,
    "from=K1L&to=NRT&depart=2026-11-02&trip=oneway": /departure airport/i,
    "from=ALL&to=NRT&depart=2026-11-02&trip=oneway&departureToken=abc": /outbound/i,
  };
  for (const [query, message] of Object.entries(cases)) {
    assert.match(parse(query).error || "", message, query);
  }
});

test("serpApiFlightParams maps the query onto google_flights parameters", () => {
  const { query } = parse("from=PEN&to=NRT&depart=2026-11-02&return=2026-11-09&adults=2&infants=1&cabin=2&bags=1");
  const params = serpApiFlightParams(query, "PEN");
  assert.equal(params.get("engine"), "google_flights");
  assert.equal(params.get("departure_id"), "PEN");
  assert.equal(params.get("arrival_id"), "NRT");
  assert.equal(params.get("type"), "1");
  assert.equal(params.get("return_date"), "2026-11-09");
  assert.equal(params.get("travel_class"), "2");
  assert.equal(params.get("adults"), "2");
  assert.equal(params.get("infants_on_lap"), "1");
  assert.equal(params.get("bags"), "1");
  assert.equal(params.get("currency"), "MYR");
  assert.equal(params.has("stops"), false, "stops are filtered in the browser");
  const oneWay = serpApiFlightParams(parse("from=PEN&to=NRT&depart=2026-11-02&trip=oneway").query, "PEN");
  assert.equal(oneWay.get("type"), "2");
  assert.equal(oneWay.has("return_date"), false);
});

test("normalizeFlightResults flattens SerpApi options into filterable flights", () => {
  const { flights, priceInsights, googleFlightsUrl } = normalizeFlightResults(googleFlightsPayload(), "KUL");
  assert.equal(flights.length, 6);
  const [redEye, , viaSingapore] = flights;
  assert.equal(redEye.category, "best");
  assert.equal(redEye.departTime, "23:45");
  assert.equal(redEye.departMinutes, 23 * 60 + 45);
  assert.equal(redEye.arriveDayOffset, 1);
  assert.equal(redEye.stops, 0);
  assert.deepEqual(viaSingapore.airlines, ["Singapore Airlines"]);
  assert.equal(viaSingapore.stops, 1);
  assert.equal(viaSingapore.layovers[0].airport, "SIN");
  assert.equal(viaSingapore.totalDuration, 65 + 60 + 420);
  const overnight = flights.find((flight) => flight.layovers.some((layover) => layover.airport === "HKG"));
  assert.equal(overnight.overnightLayover, true);
  const threeLeg = flights.find((flight) => flight.legs.length === 3);
  assert.deepEqual(threeLeg.airlines, ["Thai AirAsia", "EVA Air"]);
  assert.equal(threeLeg.oftenDelayed, true);
  assert.equal(threeLeg.stops, 2);
  assert.ok(redEye.departureToken.startsWith("token-"));
  assert.equal(priceInsights.priceLevel, "low");
  assert.deepEqual(priceInsights.typicalRange, [1100, 1700]);
  assert.equal(priceInsights.history.length, 60);
  assert.match(priceInsights.history[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(priceInsights.history.every((point, i, all) => i === 0 || all[i - 1].date <= point.date), "oldest first");
  assert.match(googleFlightsUrl, /^https:\/\/www\.google\.com\/travel\/flights/);
});

test("normalizeFlightResults tolerates empty or partial payloads", () => {
  assert.deepEqual(normalizeFlightResults({}, "KUL").flights, []);
  const { flights } = normalizeFlightResults({ best_flights: [{ price: 500, flights: [] }, { flights: [{ airline: "X" }] }] }, "KUL");
  assert.deepEqual(flights, [], "options without price or legs are dropped");
  const unsafe = normalizeFlightResults({ best_flights: [{ price: 1, airline_logo: "javascript:alert(1)", flights: [{ airline: "X", airline_logo: "http://x" }] }] }, "KUL");
  assert.equal(unsafe.flights[0].airlineLogo, "", "only https logos are kept");
});

test("legAmenities reads Google's extension strings", () => {
  assert.deepEqual(legAmenities({ legroom: "32 in", extensions: ["Above average legroom (32 in)", "Free Wi-Fi", "In-seat power & USB outlets", "On-demand video"] }), { legroomInches: 32, wifi: true, power: true, video: true });
  assert.deepEqual(legAmenities({ extensions: ["Below average legroom (28 in)"] }), { legroomInches: 28, wifi: false, power: false, video: false });
  assert.deepEqual(legAmenities({}), { legroomInches: null, wifi: false, power: false, video: false });
  assert.equal(legAmenities({ extensions: ["Stream media to your device", "In-seat USB outlet"] }).video, true);
});

test("aircraftFamily groups sub-types", () => {
  assert.equal(aircraftFamily("Boeing 737MAX 8"), "Boeing 737");
  assert.equal(aircraftFamily("Airbus A330-300"), "Airbus A330");
  assert.equal(aircraftFamily("Airbus A320neo"), "Airbus A320");
  assert.equal(aircraftFamily("Boeing 787-10"), "Boeing 787");
  assert.equal(aircraftFamily("ATR 72-600"), "ATR 72");
  assert.equal(aircraftFamily("Embraer 190"), "Embraer 190");
  assert.equal(aircraftFamily(""), "");
});

test("parseFlightSearch accepts up to three departure airports", () => {
  assert.deepEqual(parse("from=PEN,KUL,SIN&to=NRT&depart=2026-11-02&trip=oneway").query.origins, ["PEN", "KUL", "SIN"]);
  assert.deepEqual(parse("from=jhb&to=NRT&depart=2026-11-02&trip=oneway").query.origins, ["JHB"]);
  assert.deepEqual(parse("from=KUL,KUL&to=NRT&depart=2026-11-02&trip=oneway").query.origins, ["KUL"], "duplicates collapse");
  assert.match(parse("from=PEN,KUL,SIN,JHB&to=NRT&depart=2026-11-02&trip=oneway").error, /up to 3/);
  assert.match(parse("from=PEN,,K1L&to=NRT&depart=2026-11-02&trip=oneway").error, /departure airport/);
  assert.match(parse("from=PEN,NRT&to=NRT&depart=2026-11-02&trip=oneway").error, /differ/);
});
