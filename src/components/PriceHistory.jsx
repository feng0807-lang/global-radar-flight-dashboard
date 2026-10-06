import { useState } from "react";

const W = 600;
const H = 120;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;

function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

// Single-series line of the route's recent prices (from Google Flights price
// insights), with the typical range as a quiet band. Hover or arrow keys move a
// crosshair; a visually hidden table carries the same data for screen readers.
export function PriceHistory({ history, typicalRange }) {
  const [active, setActive] = useState(null);
  if (!Array.isArray(history) || history.length < 2) return null;

  const prices = history.map((point) => point.price);
  // Headroom above and below so the typical-range band reads as a band, not the whole plot.
  const dataLow = Math.min(...prices, ...(typicalRange || []));
  const dataHigh = Math.max(...prices, ...(typicalRange || []));
  const pad = Math.max(20, (dataHigh - dataLow) * 0.2);
  const low = dataLow - pad;
  const high = dataHigh + pad;
  const span = high - low;
  const x = (index) => (index / (history.length - 1)) * W;
  const y = (price) => PAD_TOP + (1 - (price - low) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const path = history.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.price).toFixed(1)}`).join(" ");
  const last = history[history.length - 1];
  const shown = active === null ? null : history[active];
  const cheapest = history.reduce((min, point) => (point.price < min.price ? point : min), history[0]);

  const pick = (clientX, rect) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (history.length - 1)));
  };
  const onKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActive((current) => Math.min(history.length - 1, Math.max(0, (current ?? history.length - 1) + step)));
  };

  return (
    <figure className="price-history">
      <figcaption>
        <span>PRICE HISTORY</span>
        <small>Cheapest fare for these dates over the last {history.length} days · lowest MYR {cheapest.price.toLocaleString()} on {shortDate(cheapest.date)}</small>
      </figcaption>
      <div className="ph-plot">
        <div className="ph-y" aria-hidden="true">
          {(typicalRange || [dataLow, dataHigh]).map((value) => <span key={value} style={{ top: `${(y(value) / H) * 100}%` }}>MYR {Math.round(value).toLocaleString()}</span>)}
        </div>
        <div
          className="ph-area"
          tabIndex={0}
          role="img"
          aria-label={`Price history: ${shortDate(history[0].date)} MYR ${history[0].price.toLocaleString()} to ${shortDate(last.date)} MYR ${last.price.toLocaleString()}. Use left and right arrow keys to read each day.`}
          onMouseMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(history.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {typicalRange && <rect className="ph-band" x="0" width={W} y={y(typicalRange[1])} height={Math.max(1, y(typicalRange[0]) - y(typicalRange[1]))} />}
            <path className="ph-line" d={path} />
            {shown && <line className="ph-cross" x1={x(active)} x2={x(active)} y1="0" y2={H} />}
          </svg>
          {typicalRange && <span className="ph-band-label" style={{ top: `${(y(typicalRange[1]) / H) * 100}%` }}>typical range</span>}
          <i className="ph-dot" style={{ left: "100%", top: `${(y(last.price) / H) * 100}%` }} />
          {shown && <i className="ph-dot active" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(shown.price) / H) * 100}%` }} />}
          {shown && <div className={`ph-tooltip ${active > history.length * 0.7 ? "flip" : ""}`} style={{ left: `${(x(active) / W) * 100}%` }}>
            <b>MYR {shown.price.toLocaleString()}</b><small>{shortDate(shown.date)}</small>
          </div>}
        </div>
      </div>
      <div className="ph-x" aria-hidden="true"><span>{shortDate(history[0].date)}</span><span>Latest · MYR {last.price.toLocaleString()}</span></div>
      <table className="sr-only">
        <caption>Price history</caption>
        <thead><tr><th>Date</th><th>Price (MYR)</th></tr></thead>
        <tbody>{history.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.price}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
