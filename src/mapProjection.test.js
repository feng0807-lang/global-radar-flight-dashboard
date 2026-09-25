import { test } from "node:test";
import assert from "node:assert/strict";
import { projectToContainer, projectToImage } from "./mapProjection.js";

// Pixel positions measured on public/assets/world-map-night.png.
const LANDMARKS = [
  { name: "London city lights", lat: 51.51, lon: -0.13, x: 710, y: 293 },
  { name: "Tokyo city lights", lat: 35.68, lon: 139.69, x: 1323, y: 387 },
  { name: "Johannesburg city lights", lat: -26.2, lon: 28.05, x: 829, y: 726 },
  { name: "Sydney city lights", lat: -33.87, lon: 151.21, x: 1376, y: 768 },
  { name: "Singapore city lights", lat: 1.35, lon: 103.82, x: 1161, y: 572 },
  { name: "Buenos Aires city lights", lat: -34.6, lon: -58.38, x: 439, y: 765 },
  { name: "Cape Morris Jesup (Greenland north tip)", lat: 83.66, lon: -33.4, x: 542, y: 77 },
  { name: "Steep Point (Australia west tip)", lat: -26.15, lon: 113.16, x: 1209, y: 716 },
];

for (const landmark of LANDMARKS) {
  test(`${landmark.name} lands within 20px of the artwork`, () => {
    const point = projectToImage(landmark.lat, landmark.lon);
    const error = Math.hypot(point.x - landmark.x, point.y - landmark.y);
    assert.ok(error < 20, `off by ${error.toFixed(1)}px (got ${point.x.toFixed(0)},${point.y.toFixed(0)})`);
  });
}

test("longitudes west of the image edge wrap to the right-hand side", () => {
  const samoa = projectToImage(-13.8, -171.8);
  assert.ok(samoa.x > 1450 && samoa.x < 1536, `x=${samoa.x}`);
  const honolulu = projectToImage(21.3, -157.9);
  assert.ok(honolulu.x >= 0 && honolulu.x < 20, `x=${honolulu.x}`);
});

test("container projection follows object-fit: cover scaling and centring", () => {
  const image = projectToImage(0, 0);
  const wide = projectToContainer(0, 0, 3072, 1024);
  assert.equal(wide.x, image.x * 2);
  assert.equal(wide.y, image.y * 2 - 512);
});
