// A curved flight path between two projected points, bowed away from the equator line
// so arcs read like great-circle routes on the flat map.
export function arcPath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return "";
  const lift = Math.min(distance * 0.28, 180);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  // Unit normal, flipped so the bow always points up the screen (northwards).
  let nx = -dy / distance;
  let ny = dx / distance;
  if (ny > 0) { nx = -nx; ny = -ny; }
  return `M${from.x.toFixed(1)},${from.y.toFixed(1)} Q${(midX + nx * lift).toFixed(1)},${(midY + ny * lift).toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
}

// Greedy map-label placement: cheapest fares claim label space first. A label that
// would overlap tries the left side of its pin, then collapses to its dot (shown again
// on hover/focus).
export const PIN_DOT_RADIUS = 13;
const LABEL_HEIGHT = 30;
export function labelBox(point, city, side) {
  const width = Math.max(75, city.length * 8 + 18);
  const top = point.y - LABEL_HEIGHT / 2;
  const bottom = point.y + LABEL_HEIGHT / 2;
  return side === "left"
    ? { left: point.x - PIN_DOT_RADIUS - width, right: point.x + PIN_DOT_RADIUS, top, bottom }
    : { left: point.x - PIN_DOT_RADIUS, right: point.x + PIN_DOT_RADIUS + width, top, bottom };
}
export function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
