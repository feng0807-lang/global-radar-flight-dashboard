import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { Dialog } from "./Dialog.jsx";
import { usePersistentState } from "../storage.js";
import { daysFromToday, isIsoDate } from "../dates.js";
import {
  activeFilterCount,
  DAY_MINUTES,
  DEFAULT_FLIGHT_FILTERS,
  filterAndSortFlights,
  flightFacets,
  formatClock,
  formatDuration,
  isRedEye,
  RED_EYE_END,
  RED_EYE_START,
  SORTS,
} from "../flightFilters.js";

const CABINS = [["1", "Economy"], ["2", "Premium economy"], ["3", "Business"], ["4", "First"]];
const ORIGINS = [["ALL", "Penang + KL"], ["PEN", "Penang (PEN)"], ["KUL", "Kuala Lumpur (KUL)"]];
const TIGHT_CONNECTION = 60;

function isoInDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FORM = {
  from: "ALL",
  to: null, // { id, name, description }
  trip: "round",
  depart: "",
  return: "",
  adults: 1,
  children: 0,
  infants: 0,
  cabin: "1",
  bags: 0,
};

// Saved forms drop past dates and anything malformed.
function validForm(value) {
  return value && typeof value === "object" && ["ALL", "PEN", "KUL"].includes(value.from)
    && (value.depart === "" || (isIsoDate(value.depart) && daysFromToday(value.depart) >= 0));
}

function AirportField({ label, value, onChange }) {
  const [text, setText] = useState(value?.name || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setText(value?.name || ""); }, [value?.name]);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2 || term === value?.name || window.location.protocol === "file:") {
      setSuggestions([]);
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/flights/locations?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const payload = await response.json();
        if (active) setSuggestions(response.ok && Array.isArray(payload.suggestions) ? payload.suggestions : []);
      } catch {
        if (active) setSuggestions([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, value?.name]);

  // A typed 3-letter code works without picking a suggestion.
  const commitTyped = () => {
    const code = text.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code) && code !== value?.id) onChange({ id: code, name: code, description: "" });
  };

  return (
    <div className="fs-field fs-airport">
      <label>
        <span>{label}</span>
        <input
          value={text}
          placeholder="City or airport code"
          autoComplete="off"
          aria-label={label}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => { setOpen(false); commitTyped(); }, 150)}
          onChange={(event) => { setText(event.target.value); onChange(null); setOpen(true); }}
        />
      </label>
      {loading && <Icon className="spin fs-airport-loading">progress_activity</Icon>}
      {open && text.trim().length >= 2 && (suggestions.length > 0 || !loading) && (
        <div className="location-suggestions fs-suggestions" role="listbox">
          {suggestions.length ? suggestions.map((airport) => (
            <button type="button" role="option" aria-selected={airport.id === value?.id} key={airport.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(airport); setText(airport.name); setOpen(false); }}>
              <Icon>flight_land</Icon>
              <span><strong>{airport.name}</strong><small>{airport.description}</small></span>
              <b>{airport.id}</b>
            </button>
          )) : <p>{/^[a-z]{3}$/i.test(text.trim()) ? `Press Search to use airport code ${text.trim().toUpperCase()}.` : "No airports found. Try a city or 3-letter code."}</p>}
        </div>
      )}
    </div>
  );
}

function Stepper({ label, hint, value, min, max, onChange }) {
  return (
    <div className="fs-stepper">
      <span><b>{label}</b><small>{hint}</small></span>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}><Icon>remove</Icon></button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}><Icon>add</Icon></button>
    </div>
  );
}

function SearchBar({ form, setForm, onSearch, loading }) {
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const travellers = form.adults + form.children + form.infants;
  const today = isoInDays(0);
  return (
    <form className="fs-searchbar" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
      <div className="fs-row fs-row-options">
        <div className="fs-segmented" role="group" aria-label="Trip type">
          {[["round", "Round trip"], ["oneway", "One way"]].map(([value, label]) => (
            <button type="button" key={value} className={form.trip === value ? "active" : ""} aria-pressed={form.trip === value} onClick={() => update({ trip: value })}>{label}</button>
          ))}
        </div>
        <details className="fs-pax">
          <summary><Icon>person</Icon>{travellers} {travellers === 1 ? "traveller" : "travellers"}</summary>
          <div className="fs-pax-panel">
            <Stepper label="Adults" hint="12+" value={form.adults} min={1} max={9 - form.children - form.infants} onChange={(adults) => update({ adults, infants: Math.min(form.infants, adults) })} />
            <Stepper label="Children" hint="2–11" value={form.children} min={0} max={9 - form.adults - form.infants} onChange={(children) => update({ children })} />
            <Stepper label="Infants" hint="On lap, under 2" value={form.infants} min={0} max={Math.min(form.adults, 9 - form.adults - form.children)} onChange={(infants) => update({ infants })} />
          </div>
        </details>
        <label className="fs-select"><span className="sr-only">Cabin class</span>
          <select value={form.cabin} onChange={(event) => update({ cabin: event.target.value })} aria-label="Cabin class">
            {CABINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="fs-select"><Icon>luggage</Icon>
          <select value={form.bags} onChange={(event) => update({ bags: Number(event.target.value) })} aria-label="Carry-on bags">
            <option value={0}>No carry-on bag</option>
            <option value={1}>1 carry-on bag</option>
            <option value={2}>2 carry-on bags</option>
          </select>
        </label>
      </div>
      <div className="fs-row fs-row-main">
        <label className="fs-field"><span>From</span>
          <select value={form.from} onChange={(event) => update({ from: event.target.value })} aria-label="From">
            {ORIGINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <AirportField label="To" value={form.to} onChange={(to) => update({ to })} />
        <label className="fs-field"><span>Departure</span>
          <input type="date" aria-label="Departure" min={today} value={form.depart} onChange={(event) => update({ depart: event.target.value, return: form.return && form.return < event.target.value ? "" : form.return })} />
        </label>
        <label className={`fs-field ${form.trip === "oneway" ? "fs-disabled" : ""}`}><span>Return</span>
          <input type="date" aria-label="Return" min={form.depart || today} value={form.trip === "oneway" ? "" : form.return} disabled={form.trip === "oneway"} onChange={(event) => update({ return: event.target.value })} />
        </label>
        <button className="fs-search-button" type="submit" disabled={loading}>
          <Icon className={loading ? "spin" : ""}>{loading ? "progress_activity" : "search"}</Icon>
          <span>{loading ? "Searching…" : "Search"}</span>
        </button>
      </div>
    </form>
  );
}

const hourLabel = (minutes) => formatClock(minutes);

function WindowFilter({ label, value, onChange }) {
  const [start, end] = value;
  return (
    <div className="fs-window">
      <div className="fs-filter-row"><span>{label}</span><b>{hourLabel(start)} – {hourLabel(end)}</b></div>
      <label><small>From</small><input type="range" min="0" max={DAY_MINUTES} step="60" value={start} aria-label={`${label} from`} onChange={(event) => onChange([Math.min(Number(event.target.value), end - 60), end])} /></label>
      <label><small>To</small><input type="range" min="0" max={DAY_MINUTES} step="60" value={end} aria-label={`${label} to`} onChange={(event) => onChange([start, Math.max(Number(event.target.value), start + 60)])} /></label>
    </div>
  );
}

function toggleIn(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function FlightFilters({ filters, setFilters, facets, total, shown, mobile = false, close }) {
  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const active = activeFilterCount(filters);
  const money = (value) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : `MYR ${Math.round(value).toLocaleString()}`);
  return (
    <aside className={`filters fs-filters ${mobile ? "filters-mobile" : ""}`} aria-label="Flight filters">
      {mobile && <button className="icon-button filter-close" onClick={close} aria-label="Close filters"><Icon>close</Icon></button>}
      <div className="fs-filters-head">
        <h2>FILTERS</h2>
        <p>{shown} of {total} flights</p>
        <button type="button" className="fs-clear" disabled={!active} onClick={() => setFilters(DEFAULT_FLIGHT_FILTERS)}>Clear filters{active ? ` (${active})` : ""}</button>
      </div>

      <div className="filter-section">
        <div className="filter-title"><span>STOPS</span></div>
        {[["any", "Any number of stops"], ["0", "Nonstop only"], ["1", "1 stop or fewer"], ["2", "2 stops or fewer"]].map(([value, label]) => (
          <label className="check-row fs-priced" key={value}>
            <input type="radio" name="fs-stops" checked={filters.maxStops === value} onChange={() => update({ maxStops: value })} />
            <span>{label}</span><small>{money(facets.cheapestByStops[value])}</small>
          </label>
        ))}
      </div>

      {facets.origins.length > 1 && <div className="filter-section">
        <div className="filter-title"><span>DEPART FROM</span></div>
        {facets.origins.map((origin) => (
          <label className="check-row fs-priced" key={origin.code}>
            <input type="checkbox" checked={!filters.excludedOrigins.includes(origin.code)} onChange={() => update({ excludedOrigins: toggleIn(filters.excludedOrigins, origin.code) })} />
            <span>{origin.code === "PEN" ? "Penang (PEN)" : origin.code === "KUL" ? "Kuala Lumpur (KUL)" : origin.code}</span><small>{money(origin.minPrice)}</small>
          </label>
        ))}
      </div>}

      <div className="filter-section">
        <div className="filter-title">
          <span>AIRLINES</span>
          <span className="fs-links">
            <button type="button" onClick={() => update({ excludedAirlines: [] })}>All</button>
            <button type="button" onClick={() => update({ excludedAirlines: facets.airlines.map((airline) => airline.name) })}>None</button>
          </span>
        </div>
        {facets.airlines.map((airline) => (
          <label className="check-row fs-priced" key={airline.name}>
            <input type="checkbox" checked={!filters.excludedAirlines.includes(airline.name)} onChange={() => update({ excludedAirlines: toggleIn(filters.excludedAirlines, airline.name) })} />
            <span>{airline.name}</span><small>{money(airline.minPrice)}</small>
          </label>
        ))}
      </div>

      <div className="filter-section">
        <div className="fs-filter-row"><span>MAX PRICE</span><b>{filters.maxPrice === null ? "Any" : money(filters.maxPrice)}</b></div>
        <input type="range" aria-label="Maximum price" min={facets.price[0]} max={facets.price[1]} step="10" value={filters.maxPrice ?? facets.price[1]} onChange={(event) => { const value = Number(event.target.value); update({ maxPrice: value >= facets.price[1] ? null : value }); }} />
      </div>

      <div className="filter-section">
        <div className="filter-title"><span>TIMES</span></div>
        <WindowFilter label="Departure" value={filters.departWindow} onChange={(departWindow) => update({ departWindow })} />
        <WindowFilter label="Arrival" value={filters.arriveWindow} onChange={(arriveWindow) => update({ arriveWindow })} />
        <label className="check-row"><input type="checkbox" checked={filters.avoidRedEye} onChange={(event) => update({ avoidRedEye: event.target.checked })} /><span>Avoid red-eye flights (overnight, or leaving {formatClock(RED_EYE_START)}–{formatClock(RED_EYE_END)})</span></label>
      </div>

      <div className="filter-section">
        <div className="fs-filter-row"><span>MAX TRIP DURATION</span><b>{filters.maxDuration === null ? "Any" : formatDuration(filters.maxDuration)}</b></div>
        <input type="range" aria-label="Maximum trip duration" min={facets.duration[0]} max={facets.duration[1]} step="15" value={filters.maxDuration ?? facets.duration[1]} onChange={(event) => { const value = Number(event.target.value); update({ maxDuration: value >= facets.duration[1] ? null : value }); }} />
      </div>

      <div className="filter-section">
        <div className="filter-title"><span>CONNECTIONS</span></div>
        <div className="fs-filter-row"><span>Minimum layover</span><b>{filters.minLayover ? formatDuration(filters.minLayover) : "None"}</b></div>
        <input type="range" aria-label="Minimum layover" min="0" max="240" step="15" value={filters.minLayover} onChange={(event) => update({ minLayover: Number(event.target.value) })} />
        <p className="fs-hint">Hide connections shorter than this. Under {TIGHT_CONNECTION} min is tight, especially on separate tickets.</p>
        <div className="fs-filter-row"><span>Maximum layover</span><b>{filters.maxLayover === null ? "Any" : formatDuration(filters.maxLayover)}</b></div>
        <input type="range" aria-label="Maximum layover" min="60" max={Math.max(60, Math.ceil(facets.layover[1] / 60) * 60)} step="30" value={filters.maxLayover ?? Math.max(60, Math.ceil(facets.layover[1] / 60) * 60)} onChange={(event) => { const value = Number(event.target.value); update({ maxLayover: value >= Math.ceil(facets.layover[1] / 60) * 60 ? null : value }); }} />
        <label className="check-row"><input type="checkbox" checked={filters.avoidOvernightLayovers} onChange={(event) => update({ avoidOvernightLayovers: event.target.checked })} /><span>Avoid overnight layovers</span></label>
        {facets.layoverAirports.length > 0 && <>
          <p className="fs-subtitle">Connecting airports</p>
          {facets.layoverAirports.map((airport) => (
            <label className="check-row fs-priced" key={airport.code}>
              <input type="checkbox" checked={!filters.excludedLayoverAirports.includes(airport.code)} onChange={() => update({ excludedLayoverAirports: toggleIn(filters.excludedLayoverAirports, airport.code) })} />
              <span>{airport.code}<small className="fs-muted"> {airport.name}</small></span><small>{airport.count}</small>
            </label>
          ))}
        </>}
      </div>

      <div className="filter-section">
        <div className="filter-title"><span>MORE</span></div>
        <label className="check-row"><input type="checkbox" checked={filters.hideOftenDelayed} onChange={(event) => update({ hideOftenDelayed: event.target.checked })} /><span>Hide flights often delayed 30+ min</span></label>
        <label className="check-row"><input type="checkbox" checked={filters.lowerEmissionsOnly} onChange={(event) => update({ lowerEmissionsOnly: event.target.checked })} /><span>Lower-emission flights only</span></label>
      </div>
    </aside>
  );
}

function stopsText(flight) {
  if (!flight.stops) return "Nonstop";
  const where = flight.layovers.map((layover) => layover.airport).join(", ");
  return `${flight.stops} stop${flight.stops > 1 ? "s" : ""} · ${where}`;
}

// Airline logo with a plane-icon fallback if the image cannot load.
function AirlineLogo({ src }) {
  const [failed, setFailed] = useState(false);
  return <span className="fs-logo">{src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon>flight</Icon>}</span>;
}

function FlightCard({ flight, mode, onSelect, bookingUrl, expanded, onToggle }) {
  const tight = flight.layovers.some((layover) => layover.duration < TIGHT_CONNECTION);
  const redEye = isRedEye(flight);
  return (
    <article className={`fs-card ${expanded ? "expanded" : ""}`}>
      <div className="fs-card-main">
        <AirlineLogo src={flight.airlineLogo} />
        <div className="fs-times">
          <strong>{flight.departTime} – {flight.arriveTime}{flight.arriveDayOffset > 0 && <sup>+{flight.arriveDayOffset}</sup>}</strong>
          <small>{flight.airlines.join(", ")}</small>
        </div>
        <div className="fs-duration">
          <strong>{formatDuration(flight.totalDuration)}</strong>
          <small>{flight.from}–{flight.to}</small>
        </div>
        <div className="fs-stops">
          <strong>{stopsText(flight)}</strong>
          <small>{flight.layovers.map((layover) => `${formatDuration(layover.duration)} ${layover.airport}`).join(" · ") || "Direct"}</small>
        </div>
        <div className="fs-emissions">
          {flight.emissionsKg !== null && <><strong>{flight.emissionsKg} kg CO2e</strong>
            {flight.emissionsDiffPercent !== null && <small className={flight.emissionsDiffPercent < 0 ? "good" : ""}>{flight.emissionsDiffPercent > 0 ? "+" : ""}{flight.emissionsDiffPercent}% emissions</small>}</>}
        </div>
        <div className="fs-price">
          <strong>MYR {flight.price.toLocaleString()}</strong>
          <small>{mode === "oneway" ? "one way" : "round trip"} · from {flight.origin}</small>
        </div>
        <button type="button" className="fs-expand" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} flight details`}><Icon>{expanded ? "expand_less" : "expand_more"}</Icon></button>
      </div>
      {(tight || redEye || flight.overnightLayover || flight.oftenDelayed) && <div className="fs-flags">
        {redEye && <span><Icon>nightlight</Icon>Red-eye</span>}
        {flight.overnightLayover && <span><Icon>nightlight</Icon>Overnight layover</span>}
        {tight && <span className="warn"><Icon>warning</Icon>Tight connection</span>}
        {flight.oftenDelayed && <span className="warn"><Icon>warning</Icon>Often delayed 30+ min</span>}
      </div>}
      {expanded && <ol className="fs-legs">
        {flight.legs.map((leg, index) => (
          <li key={`${leg.flightNumber}-${index}`}>
            <div className="fs-leg">
              <p><b>{leg.departTime}</b> {leg.fromName} ({leg.from})</p>
              <p className="fs-leg-meta">Travel time: {formatDuration(leg.duration)}</p>
              <p><b>{leg.arriveTime}</b> {leg.toName} ({leg.to}){leg.arriveDate !== leg.departDate && <span className="fs-muted"> · {leg.arriveDate}</span>}</p>
              <p className="fs-leg-meta">{[leg.airline, leg.travelClass, leg.airplane, leg.flightNumber, leg.legroom && `Legroom ${leg.legroom}`].filter(Boolean).join(" · ")}</p>
            </div>
            {flight.layovers[index] && <p className={`fs-layover ${flight.layovers[index].duration < TIGHT_CONNECTION ? "warn" : ""}`}>
              <Icon>schedule</Icon>{formatDuration(flight.layovers[index].duration)} layover · {flight.layovers[index].name} ({flight.layovers[index].airport}){flight.layovers[index].overnight ? " · overnight" : ""}
            </p>}
          </li>
        ))}
      </ol>}
      <div className="fs-card-actions">
        {mode === "round-outbound"
          ? <button type="button" className="fs-select-button" onClick={() => onSelect(flight)} disabled={!flight.departureToken}>Select flight<Icon>arrow_forward</Icon></button>
          : bookingUrl && <a className="fs-select-button" href={bookingUrl} target="_blank" rel="noreferrer">{mode === "round-return" ? "Book this round trip" : "Book on Google Flights"}<Icon>open_in_new</Icon></a>}
      </div>
    </article>
  );
}

function PriceInsights({ insights, cheapest }) {
  if (!insights?.typicalRange) return null;
  const [low, high] = insights.typicalRange;
  const level = insights.priceLevel || "typical";
  return (
    <div className={`fs-insights level-${level}`}>
      <Icon>{level === "low" ? "trending_down" : level === "high" ? "trending_up" : "info"}</Icon>
      <p>Prices are currently <b>{level}</b> for this route. Typical range is <b>MYR {low.toLocaleString()}–{high.toLocaleString()}</b>{cheapest ? `; the cheapest shown is MYR ${cheapest.toLocaleString()}` : ""}.</p>
    </div>
  );
}

export function FlightSearchView({ viewSwitch, defaultOrigin = "ALL" }) {
  const [form, setForm] = usePersistentState("flightSearchForm", { ...DEFAULT_FORM, from: defaultOrigin }, undefined, validForm);
  const [filters, setFilters] = usePersistentState("flightFilters", DEFAULT_FLIGHT_FILTERS, undefined, (value) => value && typeof value === "object" && Array.isArray(value.departWindow));
  const [sort, setSort] = usePersistentState("flightSort", "best", undefined, (value) => value in SORTS);
  const [results, setResults] = useState(null);
  const [outbound, setOutbound] = useState(null);
  const [status, setStatus] = useState({ message: "", kind: "info" });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const outboundResults = useRef(null);

  const flights = useMemo(() => results?.flights || [], [results]);
  const facets = useMemo(() => flightFacets(flights), [flights]);
  const shown = useMemo(() => filterAndSortFlights(flights, filters, sort), [flights, filters, sort]);
  const mode = form.trip === "oneway" ? "oneway" : outbound ? "round-return" : "round-outbound";

  const runSearch = async (departureToken = "", fromOverride = null) => {
    const to = form.to?.id;
    if (!to) return setStatus({ message: "Choose where you are flying to.", kind: "error" });
    if (!form.depart) return setStatus({ message: "Choose a departure date.", kind: "error" });
    if (form.trip === "round" && !form.return) return setStatus({ message: "Choose a return date, or switch to One way.", kind: "error" });
    const params = new URLSearchParams({
      from: fromOverride || form.from,
      to,
      depart: form.depart,
      trip: form.trip,
      adults: String(form.adults),
      children: String(form.children),
      infants: String(form.infants),
      cabin: form.cabin,
      bags: String(form.bags),
    });
    if (form.trip === "round") params.set("return", form.return);
    if (departureToken) params.set("departureToken", departureToken);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    setLoading(true);
    setExpandedId(null);
    setStatus({ message: departureToken ? "Finding return flights…" : `Searching flights to ${form.to.name}…`, kind: "info" });
    try {
      const response = await fetch(`/api/flights/search?${params}`, { signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(payload?.error || `Flight search returned ${response.status}.`);
      setResults(payload);
      const found = `${payload.flights.length} ${payload.leg === "return" ? "return flights" : "flights"} found`;
      setStatus({
        message: payload.message || `${found}${payload.warnings?.length ? " · one airport unavailable" : ""}.`,
        kind: payload.flights.length ? "success" : "error",
      });
      return payload;
    } catch (error) {
      setStatus({ message: error.name === "AbortError" ? "Flight search timed out. Please try again." : /failed to fetch|networkerror/i.test(error.message) ? "Flight API server is offline. Open START_DASHBOARD.cmd, then try again." : error.message, kind: "error" });
      return null;
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  const search = async () => {
    setOutbound(null);
    outboundResults.current = null;
    await runSearch();
  };
  const selectOutbound = async (flight) => {
    outboundResults.current = results;
    const payload = await runSearch(flight.departureToken, flight.origin);
    if (payload) {
      setOutbound(flight);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const changeOutbound = () => {
    setOutbound(null);
    setResults(outboundResults.current);
    setStatus({ message: "Choose a different outbound flight.", kind: "info" });
  };

  const insights = results ? Object.values(results.byOrigin || {}).find((entry) => entry.priceInsights)?.priceInsights : null;
  const bookingUrlFor = (flight) => results?.byOrigin?.[flight.origin]?.googleFlightsUrl || "";
  const filterProps = { filters, setFilters, facets, total: flights.length, shown: shown.length };

  return (
    <>
      {results && flights.length > 0 ? <FlightFilters {...filterProps} /> : <aside className="filters fs-filters fs-filters-empty"><div className="brand"><div className="brand-mark"><Icon>flight_takeoff</Icon></div><h1>SEARCH<br /><span>FLIGHTS</span></h1><p>Search a route, then filter by stops, airlines, times, layovers, and more.</p></div></aside>}
      {filtersOpen && <Dialog overlayClassName="mobile-overlay" label="Flight filters" onClose={() => setFiltersOpen(false)}>
        <FlightFilters {...filterProps} mobile close={() => setFiltersOpen(false)} />
      </Dialog>}
      <section className="workspace fs-workspace">
        <header className="topbar fs-topbar">
          {viewSwitch}
          {results && flights.length > 0 && <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)} aria-label="Open flight filters"><Icon>tune</Icon></button>}
        </header>
        <SearchBar form={form} setForm={setForm} onSearch={search} loading={loading} />
        <p className={`live-status fs-status ${status.kind}`} role="status" aria-live="polite">{status.message}</p>

        {outbound && <div className="fs-outbound">
          <span className="eyebrow">YOUR OUTBOUND FLIGHT</span>
          <p><b>{outbound.departTime} – {outbound.arriveTime}</b> · {outbound.from}–{outbound.to} · {outbound.airlines.join(", ")} · {formatDuration(outbound.totalDuration)} · {stopsText(outbound)}</p>
          <button type="button" onClick={changeOutbound}><Icon>arrow_back</Icon>Change</button>
        </div>}

        {results && <section className="fs-results" aria-label="Flight results">
          <div className="fs-results-head">
            <h2>{mode === "round-return" ? "Choose a return flight" : mode === "round-outbound" ? "Choose an outbound flight" : "Flights"}{form.to?.name ? ` · ${form.to.name}` : ""}</h2>
            <div className="fs-sorts" role="group" aria-label="Sort flights">
              {Object.entries(SORTS).map(([key, { label }]) => (
                <button type="button" key={key} className={sort === key ? "active" : ""} aria-pressed={sort === key} onClick={() => setSort(key)}>{label}</button>
              ))}
            </div>
          </div>
          <PriceInsights insights={insights} cheapest={shown[0] && Math.min(...shown.map((flight) => flight.price))} />
          {mode !== "oneway" && <p className="fs-hint fs-price-note">Round-trip prices: each fare already includes a return flight, which you choose next.</p>}
          {shown.length ? (
            <div className="fs-list">
              {shown.map((flight) => (
                <FlightCard key={flight.id} flight={flight} mode={mode} onSelect={selectOutbound} bookingUrl={bookingUrlFor(flight)} expanded={expandedId === flight.id} onToggle={() => setExpandedId(expandedId === flight.id ? null : flight.id)} />
              ))}
            </div>
          ) : (
            <div className="fs-empty">
              <Icon>filter_alt_off</Icon>
              <p>{flights.length ? `None of the ${flights.length} flights match these filters.` : "No flights found for this search."}</p>
              {flights.length > 0 && <button type="button" onClick={() => setFilters(DEFAULT_FLIGHT_FILTERS)}>Clear filters</button>}
            </div>
          )}
        </section>}

        {!results && !loading && <div className="fs-welcome">
          <Icon>travel_explore</Icon>
          <h2>Search flights from Penang and Kuala Lumpur</h2>
          <p>Pick a destination and dates. Results load once; every filter after that is instant and does not use extra searches.</p>
        </div>}
      </section>
    </>
  );
}
