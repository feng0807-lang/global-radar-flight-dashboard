// Projection for public/assets/world-map-night.png (1536×1024).
//
// The artwork is a Patterson cylindrical projection, not Mercator. Its constants
// were fitted against 17 landmarks (city-light peaks such as London, Tokyo and
// Johannesburg, plus coastline extremes such as Cape Morris Jesup and Steep Point):
// the fit is within ~6px RMS, where Mercator was off by up to ~110px.
export const MAP_IMAGE = { width: 1536, height: 1024 };

const PIXELS_PER_DEGREE_LON = 4.4266;
const PRIME_MERIDIAN_X = 702.03;
const EQUATOR_Y = 581.8;
const PATTERSON_SCALE = 294.31;
// The image spans ~347° of longitude, starting at ~158.6°W; points further west
// (e.g. Samoa) wrap around to the right-hand edge.
const WEST_EDGE_LON = -PRIME_MERIDIAN_X / PIXELS_PER_DEGREE_LON;

function patterson(latitude) {
  const phi = (Math.max(-90, Math.min(90, latitude)) * Math.PI) / 180;
  return 1.0148 * phi + 0.23185 * phi ** 5 - 0.14499 * phi ** 7 + 0.02406 * phi ** 9;
}

// Position of a latitude/longitude in the image's own pixel space.
export function projectToImage(lat, lon) {
  let longitude = ((Number(lon) + 540) % 360) - 180;
  if (longitude < WEST_EDGE_LON) longitude += 360;
  return {
    x: PRIME_MERIDIAN_X + longitude * PIXELS_PER_DEGREE_LON,
    y: EQUATOR_Y - PATTERSON_SCALE * patterson(Number(lat)),
  };
}

// Position within a container that shows the image with `object-fit: cover`.
export function projectToContainer(lat, lon, width, height) {
  const scale = Math.max(width / MAP_IMAGE.width, height / MAP_IMAGE.height);
  const point = projectToImage(lat, lon);
  return {
    x: (width - MAP_IMAGE.width * scale) / 2 + point.x * scale,
    y: (height - MAP_IMAGE.height * scale) / 2 + point.y * scale,
  };
}
