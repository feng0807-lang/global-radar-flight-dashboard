import { useEffect, useMemo, useRef, useState } from "react";

const DEALS = [
  { id: 1, city: "Bali", country: "Indonesia", price: 480, origin: "PEN", date: "Jun 5 – Jun 12", days: 7, stops: 0, theme: "Beach", lat: -8.65, lon: 115.216, accent: "gold", image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=700&q=85" },
  { id: 2, city: "Manila", country: "Philippines", price: 680, origin: "KUL", date: "Jun 3 – Jun 9", days: 6, stops: 0, theme: "City", lat: 14.5995, lon: 120.9842, accent: "teal", image: "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=700&q=85" },
  { id: 3, city: "Dubai", country: "United Arab Emirates", price: 1050, origin: "KUL", date: "Jun 10 – Jun 17", days: 8, stops: 0, theme: "City", lat: 25.2048, lon: 55.2708, accent: "teal", image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=700&q=85" },
  { id: 4, city: "Taipei", country: "Taiwan", price: 1150, origin: "PEN", date: "Jun 8 – Jun 15", days: 7, stops: 0, theme: "Food", lat: 25.033, lon: 121.5654, accent: "gold", image: "https://images.unsplash.com/photo-1470004914212-05527e49370b?auto=format&fit=crop&w=700&q=85" },
  { id: 5, city: "Seoul", country: "South Korea", price: 1250, origin: "KUL", date: "Jun 9 – Jun 16", days: 7, stops: 1, theme: "City", lat: 37.5665, lon: 126.978, accent: "teal", image: "https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=700&q=85" },
  { id: 6, city: "Istanbul", country: "Türkiye", price: 1350, origin: "PEN", date: "Jun 6 – Jun 13", days: 7, stops: 1, theme: "Culture", lat: 41.0082, lon: 28.9784, accent: "coral", image: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=700&q=85" },
  { id: 7, city: "Tokyo", country: "Japan", price: 1890, origin: "KUL", date: "Jun 12 – Jun 20", days: 8, stops: 1, theme: "Food", lat: 35.6762, lon: 139.6503, accent: "coral", image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=700&q=85" },
  { id: 8, city: "London", country: "United Kingdom", price: 1980, origin: "PEN", date: "Jun 18 – Jun 27", days: 9, stops: 1, theme: "Culture", lat: 51.5074, lon: -0.1278, accent: "gold", image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=700&q=85" },
  { id: 9, city: "Sydney", country: "Australia", price: 2150, origin: "KUL", date: "Jun 8 – Jun 17", days: 9, stops: 1, theme: "Beach", lat: -33.8688, lon: 151.2093, accent: "coral", image: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=700&q=85" },
  { id: 10, city: "Cape Town", country: "South Africa", price: 2250, origin: "KUL", date: "Jun 14 – Jun 23", days: 9, stops: 1, theme: "Nature", lat: -33.9249, lon: 18.4241, accent: "teal", image: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=700&q=85" },
  { id: 11, city: "Paris", country: "France", price: 1850, origin: "PEN", date: "Jun 20 – Jun 28", days: 8, stops: 1, theme: "Culture", lat: 48.8566, lon: 2.3522, accent: "coral", image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=700&q=85" },
  { id: 12, city: "New York", country: "United States", price: 2780, origin: "KUL", date: "Jun 15 – Jun 25", days: 10, stops: 2, theme: "City", lat: 40.7128, lon: -74.006, accent: "coral", image: "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=700&q=85" },
];

const Icon = ({ children, className = "" }) => <span className={`material-symbols-rounded ${className}`}>{children}</span>;

function monthValue(offset = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysFromToday(date) {
  if (!date) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${date}T00:00:00`) - today) / 86400000);
}

function searchableText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function FilterPanel({ minPrice, setMinPrice, maxPrice, setMaxPrice, stopFilter, setStopFilter, themes, toggleTheme, reset, dateMode, setDateMode, outboundDate, setOutboundDate, returnDate, setReturnDate, travelMonth, setTravelMonth, minTripDays, setMinTripDays, maxTripDays, setMaxTripDays, selectedCountry, setSelectedCountry, countries, weatherFilter, setWeatherFilter, minDryPercent, setMinDryPercent, mobile = false, close }) {
  return (
    <aside className={`filters ${mobile ? "filters-mobile" : ""}`}>
      {mobile && <button className="icon-button filter-close" onClick={close} aria-label="Close filters"><Icon>close</Icon></button>}
      <div className="brand">
        <div className="brand-mark"><Icon>flight_takeoff</Icon></div>
        <h1>DISCOVER<br /><span>CHEAP FLIGHTS</span></h1>
        <p>Fly further for less.</p>
      </div>
      <div className="filter-section">
        <div className="filter-title"><span>FARE RANGE (MYR)</span><strong>{minPrice.toLocaleString()} – {maxPrice.toLocaleString()}</strong></div>
        <div className="budget-control">
          <label><span>Minimum fare</span><b>MYR {minPrice.toLocaleString()}</b><input aria-label="Minimum fare" type="range" min="0" max={maxPrice - 50} step="50" value={minPrice} onChange={(event) => setMinPrice(Number(event.target.value))} /></label>
          <label><span>Maximum fare</span><b>MYR {maxPrice.toLocaleString()}</b><input aria-label="Maximum fare" type="range" min={minPrice + 50} max="5000" step="50" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} /></label>
        </div>
        <div className="range-labels"><span>Exclude nearby cheap trips</span><span>MYR 5,000</span></div>
      </div>
      <div className="filter-section">
        <div className="filter-title"><span>TRIP DATES</span></div>
        <div className="segmented segmented-three">
          <button className={dateMode === "anytime" ? "active" : ""} onClick={() => setDateMode("anytime")}><Icon>calendar_month</Icon> Anytime</button>
          <button className={dateMode === "specific" ? "active" : ""} onClick={() => setDateMode("specific")}><Icon>date_range</Icon> Specific</button>
          <button className={dateMode === "month" ? "active" : ""} onClick={() => setDateMode("month")}><Icon>calendar_view_month</Icon> By month</button>
        </div>
        {dateMode === "specific" && <div className="date-fields">
          <label><span>Depart</span><input aria-label="Departure date" type="date" min={new Date().toISOString().slice(0, 10)} value={outboundDate} onChange={(event) => setOutboundDate(event.target.value)} /></label>
          <label><span>Return</span><input aria-label="Return date" type="date" min={outboundDate || new Date().toISOString().slice(0, 10)} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label>
        </div>}
        {dateMode === "month" && <div className="month-fields">
          <label className="month-choice"><span>Travel month</span><input aria-label="Travel month" type="month" min={monthValue(0)} max={monthValue(5)} value={travelMonth} onChange={(event) => setTravelMonth(event.target.value)} /></label>
          <div className="duration-fields">
            <label><span>Min days</span><input aria-label="Minimum trip days" type="number" min="2" max="21" value={minTripDays} onChange={(event) => setMinTripDays(event.target.value)} /></label>
            <label><span>Max days</span><input aria-label="Maximum trip days" type="number" min="2" max="21" value={maxTripDays} onChange={(event) => setMaxTripDays(event.target.value)} /></label>
          </div>
          <p className="month-hint">Trips returned within your custom day range.</p>
        </div>}
      </div>
      <div className="filter-section">
        <div className="filter-title"><span>COUNTRY FILTER (OPTIONAL)</span></div>
        <label className="select-field">
          <Icon>public</Icon>
          <select aria-label="Destination country" value={selectedCountry} onChange={(event) => setSelectedCountry(event.target.value)}>
            <option value="ALL">Everywhere</option>
            {countries.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>
        </label>
      </div>
      <div className="filter-section">
        <div className="filter-title"><span>WEATHER</span><strong>{minDryPercent}%+ dry days</strong></div>
        <label className="weather-toggle">
          <input type="checkbox" checked={weatherFilter} onChange={(event) => setWeatherFilter(event.target.checked)} />
          <span><Icon>partly_cloudy_day</Icon> Avoid rainy trips</span>
        </label>
        {weatherFilter && <>
          <input aria-label="Minimum dry days percentage" type="range" min="50" max="100" step="5" value={minDryPercent} onChange={(event) => setMinDryPercent(Number(event.target.value))} />
          <p className="weather-hint">Uses forecasts up to 16 days ahead. A dry day means less than 1mm forecast rain.</p>
        </>}
      </div>
      <div className="filter-section">
        <div className="filter-title"><span>STOPS</span></div>
        {[
          ["any", "Any stops"],
          ["1", "Non-stop only"],
          ["2", "Up to 1 stop"],
          ["3", "Up to 2 stops"],
        ].map(([value, label]) => (
          <label className="check-row" key={value}>
            <input type="radio" name="stops" value={value} checked={stopFilter === value} onChange={(e) => setStopFilter(e.target.value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="filter-section">
        <div className="filter-title"><span>THEMES</span></div>
        {["Beach", "City", "Nature", "Culture", "Food"].map((theme) => (
          <label className="check-row" key={theme}>
            <input type="checkbox" checked={themes.includes(theme)} onChange={() => toggleTheme(theme)} />
            <span>{theme}</span>
          </label>
        ))}
      </div>
      <button className="reset-button" onClick={reset}><Icon>restart_alt</Icon> Reset filters</button>
      <p className="data-note"><span className="live-dot" /> Demo fares · API-ready data layer</p>
    </aside>
  );
}

function DealCard({ deal, saved, onSave, onOpen }) {
  const origins = deal.origins || [deal.origin];
  const originClass = origins.length > 1 ? "both" : origins[0]?.toLowerCase();
  return (
    <article className={`deal-card origin-${originClass}`} onClick={() => onOpen(deal)}>
      <div className="deal-image-wrap">
        <img src={deal.image} alt={`${deal.city}, ${deal.country}`} />
        <button className={`save-button ${saved ? "saved" : ""}`} aria-label={`Save ${deal.city}`} onClick={(e) => { e.stopPropagation(); onSave(deal.id); }}>
          <Icon>{saved ? "bookmark_added" : "bookmark"}</Icon>
        </button>
        <span className={`route-pill origin-${originClass}`}>{origins.length > 1 ? "PEN + KUL" : origins[0]}</span>
      </div>
      <div className="deal-content">
        <div>
          <h3>{deal.city}</h3>
          <p>{deal.country}</p>
        </div>
        <p className="airline-line"><Icon>airlines</Icon>{deal.airline ? `${deal.airline}${deal.airlineCode ? ` · ${deal.airlineCode}` : ""}` : "Airline shown on live fares"}</p>
        <p className={`weather-line ${deal.weather?.available ? "available" : ""}`}><Icon>{deal.weather?.available ? "partly_cloudy_day" : "cloud_off"}</Icon>{deal.weather?.available ? `${deal.weather.dryPercent}% dry forecast · ${deal.weather.dryDays}/${deal.weather.totalDays} days` : "Weather forecast unavailable"}</p>
        <div className={`deal-price ${deal.accent}`}><small>from</small><strong>MYR {deal.price.toLocaleString()}</strong></div>
        <div className="deal-meta"><span><Icon>calendar_today</Icon>{deal.date}</span><span>{deal.days} days</span></div>
      </div>
    </article>
  );
}

export function App() {
  const [deals, setDeals] = useState(DEALS);
  const [origin, setOrigin] = useState("ALL");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(3000);
  const [stopFilter, setStopFilter] = useState("any");
  const [themes, setThemes] = useState([]);
  const [sort, setSort] = useState("price");
  const [query, setQuery] = useState("");
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [saved, setSaved] = useState([1, 4, 8]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dataMode, setDataMode] = useState("demo");
  const [liveStatus, setLiveStatus] = useState("");
  const [liveStatusKind, setLiveStatusKind] = useState("info");
  const [liveLoading, setLiveLoading] = useState(false);
  const [apiHealth, setApiHealth] = useState("checking");
  const [dateMode, setDateMode] = useState("anytime");
  const [outboundDate, setOutboundDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [travelMonth, setTravelMonth] = useState(monthValue(1));
  const [minTripDays, setMinTripDays] = useState("4");
  const [maxTripDays, setMaxTripDays] = useState("10");
  const [selectedCountry, setSelectedCountry] = useState("ALL");
  const [weatherFilter, setWeatherFilter] = useState(false);
  const [minDryPercent, setMinDryPercent] = useState(80);
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapDragging, setMapDragging] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setMapSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const checkApi = async () => {
      if (window.location.protocol === "file:") {
        if (active) setApiHealth("offline");
        return;
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/status", { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (active) setApiHealth(response.ok && payload.keyConfigured ? "online" : "unconfigured");
      } catch {
        if (active) setApiHealth("offline");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    checkApi();
    const interval = window.setInterval(checkApi, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const searchTerm = query.trim();
    if (searchTerm.length < 2 || searchTerm === selectedDestination?.name || window.location.protocol === "file:") {
      setLocationSuggestions([]);
      setLocationLoading(false);
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLocationLoading(true);
      try {
        const response = await fetch(`/api/flights/locations?q=${encodeURIComponent(searchTerm)}`, { signal: controller.signal });
        const payload = await response.json();
        if (active) setLocationSuggestions(response.ok && Array.isArray(payload.suggestions) ? payload.suggestions : []);
      } catch {
        if (active) setLocationSuggestions([]);
      } finally {
        if (active) setLocationLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selectedDestination?.name]);

  const filtered = useMemo(() => {
    let result = deals.filter((deal) => {
      const originMatch = origin === "ALL" || (deal.origins || [deal.origin]).includes(origin);
      const stopMatch = stopFilter === "any" || deal.stops < Number(stopFilter);
      const themeMatch = themes.length === 0 || themes.includes(deal.theme);
      const searchTerms = searchableText(query).split(" ").filter(Boolean);
      const dealText = searchableText(`${deal.city} ${deal.country} ${deal.theme}`);
      const queryMatch = searchTerms.length === 0 || searchTerms.every((term) => dealText.includes(term));
      const countryMatch = selectedCountry === "ALL" || deal.country === selectedCountry;
      const weatherMatch = !weatherFilter || (deal.weather?.available && deal.weather.dryPercent >= minDryPercent);
      return originMatch && deal.price >= minPrice && deal.price <= maxPrice && stopMatch && themeMatch && queryMatch && countryMatch && weatherMatch && (!savedOnly || saved.includes(deal.id));
    });
    return [...result].sort((a, b) => sort === "price" ? a.price - b.price : sort === "days" ? a.days - b.days : a.city.localeCompare(b.city));
  }, [deals, origin, minPrice, maxPrice, stopFilter, themes, query, selectedCountry, weatherFilter, minDryPercent, savedOnly, saved, sort]);
  const countries = useMemo(() => [...new Set(deals.map((deal) => deal.country).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [deals]);

  const toggleTheme = (theme) => setThemes((current) => current.includes(theme) ? current.filter((item) => item !== theme) : [...current, theme]);
  const toggleSave = (id) => setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const updateLiveStatus = (message, kind = "info") => {
    setLiveStatus(message);
    setLiveStatusKind(kind);
  };
  const reset = () => { setMinPrice(0); setMaxPrice(3000); setStopFilter("any"); setThemes([]); setQuery(""); setSelectedDestination(null); setLocationSuggestions([]); setOrigin("ALL"); setSavedOnly(false); setDateMode("anytime"); setOutboundDate(""); setReturnDate(""); setTravelMonth(monthValue(1)); setMinTripDays("4"); setMaxTripDays("10"); setSelectedCountry("ALL"); setWeatherFilter(false); setMinDryPercent(80); };
  const filterProps = { minPrice, setMinPrice, maxPrice, setMaxPrice, stopFilter, setStopFilter, themes, toggleTheme, reset, dateMode, setDateMode, outboundDate, setOutboundDate, returnDate, setReturnDate, travelMonth, setTravelMonth, minTripDays, setMinTripDays, maxTripDays, setMaxTripDays, selectedCountry, setSelectedCountry, countries, weatherFilter, setWeatherFilter, minDryPercent, setMinDryPercent };
  const loadLiveFares = async () => {
    if (liveLoading) return;
    if (window.location.protocol === "file:") {
      updateLiveStatus("Live fares need the local API server. Open START_DASHBOARD.cmd.", "error");
      return;
    }
    if (query.trim() && !selectedDestination) {
      updateLiveStatus("Choose a city, airport, or region from the worldwide destination suggestions.", "error");
      setLocationSearchOpen(true);
      return;
    }
    if (dateMode === "specific" && (!outboundDate || !returnDate)) {
      updateLiveStatus("Choose both departure and return dates.", "error");
      return;
    }
    if (dateMode === "specific" && returnDate <= outboundDate) {
      updateLiveStatus("Return date must be after departure date.", "error");
      return;
    }
    const minimumDays = Number(minTripDays);
    const maximumDays = Number(maxTripDays);
    if (dateMode === "month" && !travelMonth) {
      updateLiveStatus("Choose a travel month.", "error");
      return;
    }
    if (dateMode === "month" && (!Number.isInteger(minimumDays) || !Number.isInteger(maximumDays) || minimumDays < 2 || maximumDays > 21 || minimumDays > maximumDays)) {
      updateLiveStatus("Enter a valid trip range from 2 to 21 days.", "error");
      return;
    }
    if (weatherFilter && dateMode !== "specific") {
      updateLiveStatus("Dry-weather filtering needs specific travel dates.", "error");
      return;
    }
    if (weatherFilter && (daysFromToday(outboundDate) < 0 || daysFromToday(returnDate) > 16)) {
      updateLiveStatus("Weather forecasts are only available for trips ending within 16 days.", "error");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35000);
    setLiveLoading(true);
    updateLiveStatus(`Searching ${origin === "ALL" ? "Penang and Kuala Lumpur" : origin}...`);
    try {
      const params = new URLSearchParams({ origin, minPrice: String(minPrice), maxPrice: String(maxPrice), stops: stopFilter, dateMode });
      if (selectedDestination) {
        params.set("arrivalId", selectedDestination.id);
        params.set("arrivalType", selectedDestination.type);
        params.set("arrivalName", selectedDestination.name);
        if (selectedDestination.description) params.set("arrivalDescription", selectedDestination.description);
      }
      if (dateMode === "specific") {
        params.set("outboundDate", outboundDate);
        params.set("returnDate", returnDate);
      }
      if (dateMode === "month") {
        params.set("travelMonth", travelMonth);
        params.set("minTripDays", String(minimumDays));
        params.set("maxTripDays", String(maximumDays));
      }
      if (weatherFilter) {
        params.set("weather", "true");
        params.set("minDryPercent", String(minDryPercent));
      }
      const response = await fetch(`/api/flights/explore?${params}`, { signal: controller.signal });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : null;
      if (!response.ok) throw new Error(payload?.error || `Flight API returned ${response.status}.`);
      if (!payload) throw new Error("Flight API returned an invalid response.");
      if (!Array.isArray(payload.deals) || payload.deals.length === 0) {
        throw new Error(selectedDestination
          ? `No live fares found to ${selectedDestination.name} for these dates and filters. Try Anytime, Specific dates, a wider trip-day range, or a higher maximum fare.`
          : "No live fares matched these filters. Try widening the fare range or travel dates.");
      }
      setDeals(payload.deals);
      if (selectedCountry !== "ALL" && !payload.deals.some((deal) => deal.country === selectedCountry)) setSelectedCountry("ALL");
      setDataMode("live");
      setApiHealth("online");
      const updatedAt = payload.retrievedAt ? new Date(payload.retrievedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      updateLiveStatus(`${payload.deals.length} live ${selectedDestination ? `fare${payload.deals.length === 1 ? "" : "s"} to ${selectedDestination.name}` : "destinations"} loaded${payload.tripDayRangeApproximate ? " · closest available exact dates" : ""}${updatedAt ? ` · updated ${updatedAt}` : ""}${payload.warnings?.length ? " · one airport unavailable" : ""}`, "success");
    } catch (error) {
      const isOffline = error instanceof TypeError || /failed to fetch|networkerror/i.test(error.message);
      if (isOffline) setApiHealth("offline");
      updateLiveStatus(error.name === "AbortError"
        ? "Live search timed out. Please try again."
        : isOffline
          ? "Flight API server is offline. Open START_DASHBOARD.cmd, then try again."
          : error.message, "error");
    } finally {
      window.clearTimeout(timeout);
      setLiveLoading(false);
    }
  };
  const useDemoFares = () => {
    setDeals(DEALS);
    setDataMode("demo");
    updateLiveStatus("Using built-in demo fares");
  };
  const clampPan = (pan, zoom = mapZoom) => {
    const limitX = mapSize.width * (zoom - 1) / 2;
    const limitY = mapSize.height * (zoom - 1) / 2;
    return {
      x: Math.max(-limitX, Math.min(limitX, pan.x)),
      y: Math.max(-limitY, Math.min(limitY, pan.y)),
    };
  };
  const setZoom = (nextZoom) => {
    const zoom = Math.max(1, Math.min(3.5, Number(nextZoom.toFixed(2))));
    setMapZoom(zoom);
    setMapPan((current) => clampPan(current, zoom));
  };
  const resetMapView = () => {
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
  };
  const onMapWheel = (event) => {
    event.preventDefault();
    setZoom(mapZoom + (event.deltaY < 0 ? 0.25 : -0.25));
  };
  const onMapPointerDown = (event) => {
    if (event.target.closest("button") || mapZoom <= 1) return;
    dragRef.current = { x: event.clientX, y: event.clientY, pan: mapPan };
    setMapDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMapPointerMove = (event) => {
    if (!dragRef.current) return;
    setMapPan(clampPan({
      x: dragRef.current.pan.x + event.clientX - dragRef.current.x,
      y: dragRef.current.pan.y + event.clientY - dragRef.current.y,
    }));
  };
  const onMapPointerUp = (event) => {
    dragRef.current = null;
    setMapDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const projectLocation = (lat, lon) => {
    const scale = Math.max(mapSize.width / 1536, mapSize.height / 1024);
    const renderedWidth = 1536 * scale;
    const renderedHeight = 1024 * scale;
    const clampedLat = Math.max(-85.0511, Math.min(85.0511, Number(lat)));
    const latitudeRadians = clampedLat * Math.PI / 180;
    const mercatorY = (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2;
    return {
      x: (mapSize.width - renderedWidth) / 2 + ((Number(lon) + 180) / 360) * renderedWidth,
      y: (mapSize.height - renderedHeight) / 2 + mercatorY * renderedHeight,
    };
  };
  const penangPoint = projectLocation(5.4141, 100.3288);
  const klPoint = projectLocation(3.139, 101.6869);

  return (
    <main className="app-shell">
      <FilterPanel {...filterProps} />
      {filtersOpen && <div className="mobile-overlay" onClick={() => setFiltersOpen(false)}>
        <div onClick={(e) => e.stopPropagation()}><FilterPanel mobile close={() => setFiltersOpen(false)} {...filterProps} /></div>
      </div>}

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}><Icon>tune</Icon></button>
          <div className="origin-switch">
            {[
              ["ALL", "Both airports"],
              ["PEN", "Penang"],
              ["KUL", "Kuala Lumpur"],
            ].map(([code, label]) => <button key={code} className={origin === code ? "active" : ""} onClick={() => setOrigin(code)}><small>From</small><strong>{label}</strong></button>)}
          </div>
          <div className="search-box-wrap">
            <label className={`search-box ${selectedDestination ? "selected" : ""}`}>
              <Icon>{selectedDestination ? "location_on" : "travel_explore"}</Icon>
              <input aria-label="Worldwide destination search" value={query} onFocus={() => setLocationSearchOpen(true)} onBlur={() => window.setTimeout(() => setLocationSearchOpen(false), 150)} onChange={(event) => { setQuery(event.target.value); setSelectedDestination(null); setLocationSearchOpen(true); }} placeholder="Search destination airport or code..." autoComplete="off" />
              {locationLoading && <Icon className="spin location-loading">progress_activity</Icon>}
              {query && !locationLoading && <button type="button" className="location-clear" aria-label="Clear destination" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setSelectedDestination(null); setLocationSuggestions([]); }}><Icon>close</Icon></button>}
            </label>
            {locationSearchOpen && query.trim().length >= 2 && <div className="location-suggestions">
              {locationSuggestions.length ? locationSuggestions.map((location) => <button type="button" key={`${location.type}-${location.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedDestination(location); setQuery(location.name); setSelectedCountry("ALL"); setLocationSuggestions([]); setLocationSearchOpen(false); }}>
                <Icon>flight</Icon>
                <span><strong>{location.name}</strong><small>{location.description || location.type}</small></span>
                <b>{location.type}</b>
              </button>) : !locationLoading && <p>No destination airports found. Try a city or airport code.</p>}
            </div>}
          </div>
          <button className={`saved-deals ${savedOnly ? "active" : ""}`} onClick={() => setSavedOnly(!savedOnly)}><Icon>bookmark</Icon><span>Saved deals</span><b>{saved.length}</b></button>
          <span className={`api-health ${apiHealth}`} title={apiHealth === "online" ? "Local flight API connected" : apiHealth === "unconfigured" ? "API key is not configured" : apiHealth === "checking" ? "Checking local flight API" : "Local flight API is offline"}><i />{apiHealth === "online" ? "API ready" : apiHealth === "checking" ? "Checking API" : apiHealth === "unconfigured" ? "No API key" : "API offline"}</span>
          <button disabled={liveLoading} className={`live-search-button ${dataMode === "live" ? "active" : ""} ${liveLoading ? "loading" : ""}`} onClick={loadLiveFares}>
            <Icon className={liveLoading ? "spin" : ""}>{liveLoading ? "progress_activity" : dataMode === "live" ? "refresh" : "sync"}</Icon><span>{liveLoading ? "Searching…" : dataMode === "live" ? "Refresh live fares" : "Load live fares"}</span>
          </button>
        </header>

        <section ref={mapRef} className={`map-panel ${mapDragging ? "dragging" : ""}`} onWheel={onMapWheel} onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove} onPointerUp={onMapPointerUp} onPointerCancel={onMapPointerUp}>
          <div className="map-scene" style={{ transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})` }}>
            <img className="world-map" src="./assets/world-map-night.png" alt="Night-time world map" draggable="false" />
            <div className="origin-badge pen" style={{ left: penangPoint.x, top: penangPoint.y, "--pin-scale": 1 / mapZoom }}><Icon>flight</Icon> PEN</div>
            <div className="origin-badge kul" style={{ left: klPoint.x, top: klPoint.y, "--pin-scale": 1 / mapZoom }}><Icon>flight</Icon> KUL</div>
            {filtered.filter((deal) => Number.isFinite(deal.lat) && Number.isFinite(deal.lon)).map((deal) => {
              const point = projectLocation(deal.lat, deal.lon);
              const dealOrigins = deal.origins || [deal.origin];
              const originClass = dealOrigins.length > 1 ? "both" : dealOrigins[0]?.toLowerCase();
              return <button data-city={deal.city} key={deal.id} className={`map-pin origin-${originClass}`} style={{ left: point.x, top: point.y, "--pin-scale": 1 / mapZoom }} onClick={() => setSelected(deal)}>
                <span className="pin-dot"><Icon>location_on</Icon></span>
                <span className="pin-label"><strong>{deal.city}</strong><small>{dealOrigins.length > 1 ? "PEN + KUL" : dealOrigins[0]} · MYR {deal.price.toLocaleString()}</small></span>
              </button>;
            })}
          </div>
          <div className="map-shade" />
          <div className="map-heading">
            <span>{dataMode === "live" ? "LIVE FARE DISCOVERY" : "DEMO DISCOVERY MAP"}</span>
            <h2>{selectedDestination ? `${filtered.length} fares to ${selectedDestination.name}` : `${filtered.length} places within your budget`}</h2>
            <p>{dateMode === "specific" && outboundDate && returnDate
              ? `${outboundDate} to ${returnDate}`
              : dateMode === "month"
                ? `${travelMonth} · ${minTripDays}–${maxTripDays} days`
                : "Flexible return fares from Penang and Kuala Lumpur"}</p>
          </div>
          <div className="map-legend origin-legend"><span><i className="legend-dot pen" />From Penang</span><span><i className="legend-dot kul" />From Kuala Lumpur</span><span><i className="legend-dot both" />Both airports</span></div>
          <div className="map-help"><Icon>open_with</Icon> Drag to pan · scroll to zoom</div>
          <div className="map-controls">
            <button onClick={() => setZoom(mapZoom + 0.25)} disabled={mapZoom >= 3.5} aria-label="Zoom in"><Icon>add</Icon></button>
            <button onClick={() => setZoom(mapZoom - 0.25)} disabled={mapZoom <= 1} aria-label="Zoom out"><Icon>remove</Icon></button>
            <button onClick={resetMapView} aria-label="Reset map view"><Icon>my_location</Icon></button>
          </div>
          <div className="zoom-level">{Math.round(mapZoom * 100)}%</div>
        </section>

        <section className="deals-section">
          <div className="deals-heading">
            <div><span>BEST DEALS FROM</span><h2>{origin === "PEN" ? "PENANG" : origin === "KUL" ? "KUALA LUMPUR" : "PENANG & KUALA LUMPUR"}</h2></div>
            {liveStatus && <p className={`live-status ${liveStatusKind}`}>{liveStatus}</p>}
            <label>Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price">Price: low to high</option>
                <option value="days">Shortest trip</option>
                <option value="city">Destination A–Z</option>
              </select>
            </label>
          </div>
          <div className="deal-rail">
            {filtered.length ? filtered.map((deal) => <DealCard key={deal.id} deal={deal} saved={saved.includes(deal.id)} onSave={toggleSave} onOpen={setSelected} />) : (
              <div className="empty-state">
                <Icon>{selectedDestination ? "travel_explore" : weatherFilter ? "rainy" : "flight_takeoff"}</Icon>
                <h3>{selectedDestination && dataMode === "demo" ? `Search fares to ${selectedDestination.name}` : "No fares match those filters"}</h3>
                <p>{selectedDestination && dataMode === "demo"
                  ? "Run a live search to find current fares for this destination and trip range."
                  : weatherFilter
                    ? `No destination has ${minDryPercent}% forecast dry days for this trip.`
                    : "Try wider travel dates, trip days, or fare range."}</p>
                <button onClick={selectedDestination && dataMode === "demo" ? loadLiveFares : reset}>{selectedDestination && dataMode === "demo" ? "Search live fares" : "Reset filters"}</button>
              </div>
            )}
          </div>
        </section>
      </section>

      {selected && <div className="drawer-overlay" onClick={() => setSelected(null)}>
        <aside className="deal-drawer" onClick={(e) => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setSelected(null)}><Icon>close</Icon></button>
          <img src={selected.image} alt={selected.city} />
          <div className="drawer-content">
            <span className="eyebrow">DISCOVERED DEAL</span>
            <h2>{selected.city}</h2><p className="drawer-country">{selected.country}</p>
            <div className="drawer-price"><small>Cheapest return fare from {selected.origin === "BOTH" ? "Penang or Kuala Lumpur" : selected.origin}</small><strong>MYR {selected.price.toLocaleString()}</strong></div>
            {selected.originOptions?.length > 0 && <div className="route-options">
              {selected.originOptions.map((option) => <a key={option.origin} className={`route-option origin-${option.origin.toLowerCase()}`} href={option.link || "#"} target="_blank" rel="noreferrer">
                <span><b>{option.origin}</b><small>{option.airline}{option.airlineCode ? ` · ${option.airlineCode}` : ""}</small></span><strong>MYR {option.price.toLocaleString()}</strong>
              </a>)}
            </div>}
            <div className="drawer-grid"><span><Icon>calendar_month</Icon><small>Travel dates</small><b>{selected.date}</b></span><span><Icon>schedule</Icon><small>Trip length</small><b>{selected.days} days</b></span><span><Icon>connecting_airports</Icon><small>Stops</small><b>{selected.stops === 0 ? "Direct" : `${selected.stops} stop${selected.stops > 1 ? "s" : ""}`}</b></span><span><Icon>airlines</Icon><small>Airline</small><b>{selected.airline || "Live fares only"}</b></span><span><Icon>partly_cloudy_day</Icon><small>Dry-day forecast</small><b>{selected.weather?.available ? `${selected.weather.dryPercent}% · ${selected.weather.dryDays}/${selected.weather.totalDays} days` : "Unavailable beyond 16 days"}</b></span><span><Icon>public</Icon><small>Country</small><b>{selected.country}</b></span></div>
            <button className="primary-button" onClick={() => toggleSave(selected.id)}><Icon>{saved.includes(selected.id) ? "bookmark_added" : "bookmark_add"}</Icon>{saved.includes(selected.id) ? "Saved to your deals" : "Save this deal"}</button>
            <p className="drawer-note">{selected.theme === "Live" ? "Live fare discovered through Google Travel Explore. Open an airport offer above to continue." : "Demo fare. Load live fares to see current airlines and booking links."}</p>
          </div>
        </aside>
      </div>}
    </main>
  );
}
