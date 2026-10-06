import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTripFare } from "./savedDeals.js";

const option = (origin, price, date) => ({ origin, price, date, link: `https://example.test/${origin}/${price}`, airline: "Test Air", airlineCode: "TA" });
const liveDeal = (city, options) => ({ city, theme: "Live", price: Math.min(...options.map((o) => o.price)), originOptions: options });
const NOV = "2026-11-02 – 2026-11-09";
const DEC = "2026-12-03 – 2026-12-17";
const savedTokyo = { city: "Tokyo", theme: "Live", origin: "PEN", origins: ["PEN"], date: NOV, price: 1400, savedPrice: 1400, originOptions: [option("PEN", 1400, NOV)] };

test("matches the same city, airport, and dates", () => {
  const fare = sameTripFare(savedTokyo, liveDeal("Tokyo", [option("PEN", 1250, NOV), option("KUL", 1100, NOV)]));
  assert.equal(fare.price, 1250);
  assert.equal(fare.link, "https://example.test/PEN/1250");
});

test("ignores a different departure airport", () => {
  assert.equal(sameTripFare(savedTokyo, liveDeal("Tokyo", [option("KUL", 1100, NOV)])), null);
});

test("ignores different travel dates", () => {
  assert.equal(sameTripFare(savedTokyo, liveDeal("Tokyo", [option("PEN", 1100, DEC)])), null);
});

test("ignores a different city", () => {
  assert.equal(sameTripFare(savedTokyo, liveDeal("Osaka", [option("PEN", 900, NOV)])), null);
});

test("pairs each saved airport with its own dates", () => {
  const savedBoth = { ...savedTokyo, origin: "BOTH", origins: ["PEN", "KUL"], originOptions: [option("PEN", 1400, NOV), option("KUL", 1500, DEC)] };
  // KUL on PEN's dates is a different trip.
  assert.equal(sameTripFare(savedBoth, liveDeal("Tokyo", [option("KUL", 900, NOV)])), null);
  const fare = sameTripFare(savedBoth, liveDeal("Tokyo", [option("KUL", 1300, DEC), option("PEN", 1450, NOV)]));
  assert.equal(fare.price, 1300);
  assert.deepEqual(fare.options.map((o) => o.origin), ["KUL", "PEN"]);
});

test("falls back to the deal itself when it has no per-airport options", () => {
  const plain = { city: "Tokyo", theme: "Live", origin: "PEN", price: 1350, date: NOV, link: null };
  assert.equal(sameTripFare(savedTokyo, plain).price, 1350);
});
