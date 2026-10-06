import { test } from "node:test";
import assert from "node:assert/strict";
import { arcPath, boxesOverlap, labelBox, PIN_DOT_RADIUS } from "./geometry.js";

test("arcPath draws a quadratic curve that bows up the screen (north)", () => {
  const path = arcPath({ x: 0, y: 100 }, { x: 200, y: 100 });
  const [, cx, cy] = path.match(/Q(-?[\d.]+),(-?[\d.]+)/).map(Number);
  assert.match(path, /^M0\.0,100\.0 Q/);
  assert.equal(cx, 100);
  assert.ok(cy < 100, "control point should sit above the chord");
  // Same bow direction when drawn right-to-left.
  const back = arcPath({ x: 200, y: 100 }, { x: 0, y: 100 });
  assert.ok(Number(back.match(/Q-?[\d.]+,(-?[\d.]+)/)[1]) < 100);
  assert.equal(arcPath({ x: 5, y: 5 }, { x: 5, y: 5 }), "");
});

test("labelBox puts the label on the requested side of the dot", () => {
  const right = labelBox({ x: 100, y: 50 }, "Bali", "right");
  const left = labelBox({ x: 100, y: 50 }, "Bali", "left");
  assert.equal(right.left, 100 - PIN_DOT_RADIUS);
  assert.ok(right.right > 100 + PIN_DOT_RADIUS);
  assert.equal(left.right, 100 + PIN_DOT_RADIUS);
  assert.ok(left.left < 100 - PIN_DOT_RADIUS);
  assert.ok(labelBox({ x: 0, y: 0 }, "Kuala Lumpur", "right").right > labelBox({ x: 0, y: 0 }, "Bali", "right").right);
});

test("boxesOverlap detects intersection but not edge contact", () => {
  const a = { left: 0, right: 10, top: 0, bottom: 10 };
  assert.ok(boxesOverlap(a, { left: 5, right: 15, top: 5, bottom: 15 }));
  assert.ok(!boxesOverlap(a, { left: 10, right: 20, top: 0, bottom: 10 }));
  assert.ok(!boxesOverlap(a, { left: 0, right: 10, top: 11, bottom: 20 }));
});
