import { Icon } from "./Icon.jsx";

export function PriceChange({ change, className = "" }) {
  if (!change) return null;
  const down = change < 0;
  return (
    <span className={`price-change ${down ? "down" : "up"} ${className}`} title="Change since you saved this deal">
      <Icon>{down ? "trending_down" : "trending_up"}</Icon>
      {down ? "Down" : "Up"} MYR {Math.abs(change).toLocaleString()} since saved
    </span>
  );
}

export function DealCard({ deal, saved, onSave, onOpen, highlighted, onHover, priceChange }) {
  const origins = deal.origins || [deal.origin];
  const originClass = origins.length > 1 ? "both" : origins[0]?.toLowerCase();
  return (
    <article className={`deal-card origin-${originClass} ${highlighted ? "highlighted" : ""}`} onMouseEnter={() => onHover(deal.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(deal.id)} onBlur={() => onHover(null)}>
      <div className="deal-image-wrap">
        <img src={deal.image} alt={`${deal.city}, ${deal.country}`} />
        <button className={`save-button ${saved ? "saved" : ""}`} aria-label={saved ? `Remove ${deal.city} from saved deals` : `Save ${deal.city}`} aria-pressed={saved} onClick={(e) => { e.stopPropagation(); onSave(deal); }}>
          <Icon>{saved ? "bookmark_added" : "bookmark"}</Icon>
        </button>
        <span className={`route-pill origin-${originClass}`}>{origins.length > 1 ? "PEN + KUL" : origins[0]}</span>
      </div>
      <div className="deal-content">
        <div>
          {/* The heading's button stretches over the card so it opens from the keyboard too. */}
          <h3><button type="button" className="deal-open" onClick={(e) => { e.stopPropagation(); onOpen(deal); }} aria-label={`${deal.city}, ${deal.country}: MYR ${deal.price.toLocaleString()}, ${deal.date}`}>{deal.city}</button></h3>
          <p>{deal.country}</p>
        </div>
        <p className="airline-line"><Icon>airlines</Icon>{deal.airline ? `${deal.airline}${deal.airlineCode ? ` · ${deal.airlineCode}` : ""}` : "Airline shown on live fares"}</p>
        <p className={`weather-line ${deal.weather?.available ? "available" : ""}`}><Icon>{deal.weather?.available ? "partly_cloudy_day" : "cloud_off"}</Icon>{deal.weather?.available ? `${deal.weather.dryPercent}% dry forecast · ${deal.weather.dryDays}/${deal.weather.totalDays} days` : "Weather forecast unavailable"}</p>
        <PriceChange change={priceChange} />
        <div className={`deal-price ${deal.accent}`}><small>from</small><strong>MYR {deal.price.toLocaleString()}</strong></div>
        <div className="deal-meta"><span><Icon>calendar_today</Icon>{deal.date}</span><span>{deal.days} days</span></div>
      </div>
    </article>
  );
}
