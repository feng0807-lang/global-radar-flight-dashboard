import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, dealsToCsv } from "./csv.js";

test("csvCell quotes every value and doubles embedded quotes", () => {
  assert.equal(csvCell("Bali"), '"Bali"');
  assert.equal(csvCell('Say "hi", ok'), '"Say ""hi"", ok"');
  assert.equal(csvCell(1400), '"1400"');
  assert.equal(csvCell(null), '""');
});

test("csvCell neutralises spreadsheet formulas", () => {
  for (const attack of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
    assert.ok(csvCell(attack).startsWith(`"'`), `${JSON.stringify(attack)} was not neutralised`);
  }
});

test("dealsToCsv writes a header and one CRLF row per deal", () => {
  const csv = dealsToCsv([
    { city: "Tokyo", country: "Japan", origins: ["PEN", "KUL"], price: 1400, date: "2026-11-02 – 2026-11-09", days: 7, stops: 0, airline: "AirAsia X", originOptions: [{ link: "https://example.test/book" }] },
    { city: "Bali", country: "Indonesia", origin: "PEN", price: 480, date: "Jun 5 – Jun 12", days: 7, stops: 0 },
  ]);
  const rows = csv.split("\r\n");
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^"Destination","Country","From","Fare \(MYR\)"/);
  assert.match(rows[1], /"PEN \+ KUL","1400"/);
  assert.match(rows[1], /"https:\/\/example\.test\/book"$/);
  assert.match(rows[2], /^"Bali","Indonesia","PEN","480"/);
});
