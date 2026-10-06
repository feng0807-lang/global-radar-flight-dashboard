import { useState } from "react";

const SPREAD_STEP = 500;
const SPREAD_TOP = 5000;

// Histogram of fares in MYR 500 bands (the last band is 5,000+). Bands inside the
// fare range are teal; picking a band sets the maximum fare to its upper edge. The
// 5,000+ band sits above the fare slider's limit, so it informs but cannot be picked.
export function FareSpread({ prices, minPrice, maxPrice, onPick }) {
  const [active, setActive] = useState(null);
  const lastIndex = SPREAD_TOP / SPREAD_STEP;
  const counts = new Array(lastIndex + 1).fill(0);
  for (const price of prices) counts[Math.min(lastIndex, Math.max(0, Math.floor(price / SPREAD_STEP)))] += 1;
  const bands = counts.map((count, index) => {
    const start = index * SPREAD_STEP;
    const last = index === lastIndex;
    const end = start + SPREAD_STEP;
    return {
      index,
      start,
      last,
      label: last ? `MYR ${SPREAD_TOP.toLocaleString()}+` : `MYR ${start.toLocaleString()}–${(end - 1).toLocaleString()}`,
      count,
      inRange: !last && start <= maxPrice && end > minPrice,
      pick: last ? null : end,
    };
  });
  const tallest = Math.max(1, ...bands.map((band) => band.count));
  const shown = active === null ? null : bands[active];
  return (
    <section className="fare-spread" aria-label="Fare spread">
      <div className="fare-spread-head">
        <span>FARE SPREAD</span>
        <small>{prices.length} {prices.length === 1 ? "destination" : "destinations"} by return fare · pick a bar to set your maximum fare</small>
      </div>
      <div className="fare-spread-plot" onMouseLeave={() => setActive(null)}>
        {bands.map((band) => (
          <button
            key={band.index}
            type="button"
            className={`spread-slot ${band.inRange ? "in" : "out"} ${active === band.index ? "active" : ""}`}
            onMouseEnter={() => setActive(band.index)}
            onFocus={() => setActive(band.index)}
            onBlur={() => setActive(null)}
            onClick={() => band.pick !== null && onPick(band.pick)}
            aria-disabled={band.pick === null}
            aria-label={`${band.label}: ${band.count} ${band.count === 1 ? "destination" : "destinations"}, ${band.inRange ? "within" : "outside"} your fare range.${band.pick === null ? " Above the MYR 5,000 search limit." : ` Set maximum fare to MYR ${band.pick.toLocaleString()}.`}`}
          >
            {band.count > 0 && <i className="spread-bar" style={{ height: `${Math.max(8, (band.count / tallest) * 100)}%` }} />}
          </button>
        ))}
        {shown && <div className={`spread-tooltip ${shown.index <= 1 ? "edge-start" : shown.index >= bands.length - 2 ? "edge-end" : ""}`} style={{ "--slot": shown.index }} aria-hidden="true">
          <b>{shown.label}</b>
          <span>{shown.count} {shown.count === 1 ? "destination" : "destinations"}</span>
          <small>{shown.last ? "Above the MYR 5,000 search limit" : shown.inRange ? "Within your fare range" : "Outside your fare range"}</small>
        </div>}
      </div>
      <div className="fare-spread-axis" aria-hidden="true">
        {bands.map((band) => <span key={band.index}>{band.index % 2 === 0 ? (band.last ? "5k+" : band.start === 0 ? "0" : `${band.start / 1000}k`) : ""}</span>)}
      </div>
    </section>
  );
}
