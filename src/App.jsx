import { useEffect, useMemo, useRef, useState } from "react";
import { projectToContainer } from "./mapProjection.js";
import { HOME_AIRPORTS, isLiveDeal, sameTripFare, searchableText } from "./savedDeals.js";
import { SHARED_SEARCH } from "./sharedSearch.js";
import { DEALS } from "./demoDeals.js";
import { isIsoDate, monthValue, daysFromToday } from "./dates.js";
import { readStored, usePersistentState } from "./storage.js";
import { arcPath, PIN_DOT_RADIUS, labelBox, boxesOverlap } from "./geometry.js";
import { median, googleFlightsSearchUrl } from "./dealUtils.js";
import { dealsToCsv } from "./csv.js";
import { Icon } from "./components/Icon.jsx";
import { Dialog } from "./components/Dialog.jsx";
import { FilterPanel } from "./components/FilterPanel.jsx";
import { FareSpread } from "./components/FareSpread.jsx";
import { DealCard, PriceChange } from "./components/DealCard.jsx";

export function App() {
  const [deals, setDeals] = useState(DEALS);
  const [origin, setOrigin] = usePersistentState("origin", "ALL", SHARED_SEARCH.origin);
  // Clamp a shared minimum against the maximum this visit will actually use, so a
  // min-only link never produces min >= max (and the clamp is not saved either).
  const sharedMinPrice = SHARED_SEARCH.minPrice === undefined
    ? undefined
    : Math.max(0, Math.min(SHARED_SEARCH.minPrice, (SHARED_SEARCH.maxPrice ?? readStored("maxPrice", 3000)) - 50));
  const [minPrice, setMinPrice] = usePersistentState("minPrice", 0, sharedMinPrice);
  const [maxPrice, setMaxPrice] = usePersistentState("maxPrice", 3000, SHARED_SEARCH.maxPrice);
  const [stopFilter, setStopFilter] = usePersistentState("stops", "any", SHARED_SEARCH.stops);
  const [themes, setThemes] = usePersistentState("themes", []);
  const [sort, setSort] = usePersistentState("sort", "price");
  const [query, setQuery] = useState(SHARED_SEARCH.destination?.name || "");
  const [selectedDestination, setSelectedDestination] = useState(SHARED_SEARCH.destination);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  // Saved deals are stored whole so live fares stay saved after a refresh or new search.
  const [savedDeals, setSavedDeals] = usePersistentState("savedDeals", DEALS.filter((deal) => [1, 4, 8].includes(deal.id)));
  const saved = useMemo(() => savedDeals.map((deal) => deal.id), [savedDeals]);
  // Saved deals remember the fare at save time; a later live search that prices the
  // same trip (city, departure airport, and dates) records the latest fare so the card
  // can show how the price has moved. Only live fares are compared: demo prices are
  // illustrative and would show fake moves.
  const savedLiveByCity = useMemo(() => {
    const byCity = new Map();
    for (const entry of savedDeals.filter(isLiveDeal)) {
      const key = searchableText(entry.city);
      byCity.set(key, [...(byCity.get(key) || []), entry]);
    }
    return byCity;
  }, [savedDeals]);
  const priceChangeFor = (deal) => {
    if (!isLiveDeal(deal)) return 0;
    // Saved-view cards are saved entries already carrying their latest fare.
    if (deal.savedPrice !== undefined) return deal.price - deal.savedPrice;
    for (const entry of savedLiveByCity.get(searchableText(deal.city)) || []) {
      const fare = sameTripFare(entry, deal);
      if (fare) return fare.price - (entry.savedPrice ?? entry.price);
    }
    return 0;
  };
  const [hoveredId, setHoveredId] = useState(null);
  const searchInputRef = useRef(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dataMode, setDataMode] = useState("demo");
  const [liveStatus, setLiveStatus] = useState("");
  const [liveStatusKind, setLiveStatusKind] = useState("info");
  const [liveLoading, setLiveLoading] = useState(false);
  const [apiHealth, setApiHealth] = useState("checking");
  const [dateMode, setDateMode] = usePersistentState("dateMode", "anytime", SHARED_SEARCH.dateMode);
  // Dates persist too (so "Specific" mode reloads with its dates), but past ones are dropped.
  const [outboundDate, setOutboundDate] = usePersistentState("outboundDate", "", SHARED_SEARCH.outboundDate, (value) => value === "" || (isIsoDate(value) && daysFromToday(value) >= 0));
  const [returnDate, setReturnDate] = usePersistentState("returnDate", "", SHARED_SEARCH.returnDate, (value) => value === "" || (isIsoDate(value) && daysFromToday(value) >= 0));
  const [travelMonth, setTravelMonth] = usePersistentState("travelMonth", monthValue(1), SHARED_SEARCH.travelMonth, (value) => /^\d{4}-\d{2}$/.test(value) && value >= monthValue(0));
  const [minTripDays, setMinTripDays] = usePersistentState("minTripDays", "4", SHARED_SEARCH.minTripDays);
  const [maxTripDays, setMaxTripDays] = usePersistentState("maxTripDays", "10", SHARED_SEARCH.maxTripDays);
  const [selectedCountry, setSelectedCountry] = useState("ALL");
  const [weatherFilter, setWeatherFilter] = useState(false);
  const [minDryPercent, setMinDryPercent] = useState(80);
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapDragging, setMapDragging] = useState(false);
  const [routeResults, setRouteResults] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

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

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelected(null);
        setRouteOpen(false);
        setFiltersOpen(false);
        return;
      }
      const typing = event.target.closest?.("input, select, textarea, [contenteditable]");
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Storage may hold a bad pair (e.g. edited by hand): keep min below max.
  useEffect(() => {
    if (minPrice >= maxPrice) setMinPrice(Math.max(0, maxPrice - 50));
  }, [minPrice, maxPrice, setMinPrice]);

  const shareParams = useMemo(() => {
    const params = new URLSearchParams();
    if (origin !== "ALL") params.set("from", origin);
    if (minPrice !== 0) params.set("min", String(minPrice));
    if (maxPrice !== 3000) params.set("max", String(maxPrice));
    if (stopFilter !== "any") params.set("stops", stopFilter);
    if (dateMode !== "anytime") params.set("dates", dateMode);
    if (dateMode === "specific") {
      if (outboundDate) params.set("depart", outboundDate);
      if (returnDate) params.set("return", returnDate);
    }
    if (dateMode === "month") {
      params.set("month", travelMonth);
      params.set("minDays", String(minTripDays));
      params.set("maxDays", String(maxTripDays));
    }
    if (selectedDestination && /^[A-Z]{3}$/.test(selectedDestination.id)) {
      params.set("to", selectedDestination.id);
      params.set("toName", selectedDestination.name);
      if (selectedDestination.description) params.set("toDesc", selectedDestination.description);
    }
    return params.toString();
  }, [origin, minPrice, maxPrice, stopFilter, dateMode, outboundDate, returnDate, travelMonth, minTripDays, maxTripDays, selectedDestination]);

  // Keep the address bar in step with the search so it can be bookmarked or shared.
  useEffect(() => {
    if (window.location.protocol === "file:") return;
    const next = `${window.location.pathname}${shareParams ? `?${shareParams}` : ""}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      try {
        window.history.replaceState(null, "", next);
      } catch {
        // Some embedded contexts block history updates; sharing still copies the link.
      }
    }
  }, [shareParams]);

  // Deals matching every filter except the fare range; the fare-spread chart uses
  // these to show what a different budget would unlock.
  const nonPriceMatches = useMemo(() => deals.filter((deal) => {
      const originMatch = origin === "ALL" || (deal.origins || [deal.origin]).includes(origin);
      const stopMatch = stopFilter === "any" || deal.stops < Number(stopFilter);
      const themeMatch = themes.length === 0 || themes.includes(deal.theme);
      const searchTerms = searchableText(query).split(" ").filter(Boolean);
      const dealText = searchableText(`${deal.city} ${deal.country} ${deal.theme}`);
      const queryMatch = searchTerms.length === 0 || searchTerms.every((term) => dealText.includes(term));
      const countryMatch = selectedCountry === "ALL" || deal.country === selectedCountry;
      const weatherMatch = !weatherFilter || (deal.weather?.available && deal.weather.dryPercent >= minDryPercent);
      return originMatch && stopMatch && themeMatch && queryMatch && countryMatch && weatherMatch;
  }), [deals, origin, stopFilter, themes, query, selectedCountry, weatherFilter, minDryPercent]);

  const filtered = useMemo(() => {
    const bySort = (a, b) => sort === "price" ? a.price - b.price : sort === "days" ? a.days - b.days : a.city.localeCompare(b.city);
    if (savedOnly) {
      // Show each saved trip at its latest known fare, with that search's booking
      // details, so the drawer and CSV never mix data from two searches.
      return savedDeals.map(({ latest, latestPrice, latestDate, ...deal }) => latest ? {
        ...deal,
        price: latest.price,
        link: latest.link ?? deal.link,
        airline: latest.airline ?? deal.airline,
        airlineCode: latest.airlineCode ?? deal.airlineCode,
        originOptions: latest.originOptions?.length ? latest.originOptions : deal.originOptions,
      } : deal).sort(bySort);
    }
    return nonPriceMatches.filter((deal) => deal.price >= minPrice && deal.price <= maxPrice).sort(bySort);
  }, [nonPriceMatches, minPrice, maxPrice, savedOnly, savedDeals, sort]);
  const countries = useMemo(() => [...new Set(deals.map((deal) => deal.country).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [deals]);
  const budgetSummary = useMemo(() => {
    if (selectedDestination || savedOnly || filtered.length === 0) return null;
    const cheapest = filtered.reduce((min, deal) => (deal.price < min.price ? deal : min), filtered[0]);
    return {
      count: filtered.length,
      cheapest,
      median: median(filtered.map((deal) => deal.price)),
      direct: filtered.filter((deal) => deal.stops === 0).length,
      budget: maxPrice,
    };
  }, [filtered, selectedDestination, savedOnly, maxPrice]);

  const toggleTheme = (theme) => setThemes((current) => current.includes(theme) ? current.filter((item) => item !== theme) : [...current, theme]);
  const toggleSave = (deal) => setSavedDeals((current) => current.some((item) => item.id === deal.id)
    ? current.filter((item) => item.id !== deal.id)
    : [...current, { ...deal, savedPrice: deal.price, savedAt: new Date().toISOString(), latest: undefined }]);
  const shareSearch = async () => {
    const link = `${window.location.origin}${window.location.pathname}${shareParams ? `?${shareParams}` : ""}`;
    try {
      await navigator.clipboard.writeText(link);
      updateLiveStatus("Search link copied. Anyone opening it sees these filters and dates.", "success");
    } catch {
      window.prompt("Copy this search link:", link);
    }
  };
  const exportCsv = () => {
    if (!filtered.length) return;
    try {
      // BOM so Excel opens "MYR 1,234 – …" text as UTF-8.
      const blob = new Blob(["\ufeff", dealsToCsv(filtered)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `global-radar-${savedOnly ? "saved" : dataMode}-fares-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      updateLiveStatus(`Exported ${filtered.length} ${filtered.length === 1 ? "fare" : "fares"} to CSV.`, "success");
    } catch {
      updateLiveStatus("Could not export these fares. Try again.", "error");
    }
  };
  const setBudget = (value) => {
    setMaxPrice(value);
    setMinPrice((current) => Math.min(current, value - 50));
  };
  const updateLiveStatus = (message, kind = "info") => {
    setLiveStatus(message);
    setLiveStatusKind(kind);
  };
  const reset = () => { setMinPrice(0); setMaxPrice(3000); setStopFilter("any"); setThemes([]); setQuery(""); setSelectedDestination(null); setLocationSuggestions([]); setOrigin("ALL"); setSavedOnly(false); setSort("price"); setDateMode("anytime"); setOutboundDate(""); setReturnDate(""); setTravelMonth(monthValue(1)); setMinTripDays("4"); setMaxTripDays("10"); setSelectedCountry("ALL"); setWeatherFilter(false); setMinDryPercent(80); };
  const filterProps = { minPrice, setMinPrice, maxPrice, setMaxPrice, stopFilter, setStopFilter, themes, toggleTheme, reset, dateMode, setDateMode, outboundDate, setOutboundDate, returnDate, setReturnDate, travelMonth, setTravelMonth, minTripDays, setMinTripDays, maxTripDays, setMaxTripDays, selectedCountry, setSelectedCountry, countries, weatherFilter, setWeatherFilter, minDryPercent, setMinDryPercent };
  const loadLiveFares = async (overrides = {}) => {
    if (liveLoading) return;
    const worldwide = overrides.worldwide === true;
    const dest = worldwide ? null : selectedDestination;
    if (window.location.protocol === "file:") {
      updateLiveStatus("Live fares need the local API server. Open START_DASHBOARD.cmd.", "error");
      return;
    }
    if (!worldwide && query.trim() && !selectedDestination) {
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
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    setLiveLoading(true);
    updateLiveStatus(`Searching ${origin === "ALL" ? "Penang and Kuala Lumpur" : origin}...`);
    try {
      const params = new URLSearchParams({ origin, minPrice: String(minPrice), maxPrice: String(maxPrice), stops: stopFilter, dateMode });
      if (dest) {
        params.set("arrivalId", dest.id);
        params.set("arrivalType", dest.type);
        params.set("arrivalName", dest.name);
        if (dest.description) params.set("arrivalDescription", dest.description);
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
        throw new Error(payload.message || (dest
          ? `No live fares found to ${dest.name} for these dates and filters. Try Anytime, Specific dates, a wider trip-day range, or a higher maximum fare.`
          : "No live fares matched these filters. Try widening the fare range or travel dates."));
      }
      setDeals(payload.deals);
      const liveByCity = new Map(payload.deals.map((deal) => [searchableText(deal.city), deal]));
      const latestFor = (entry) => {
        const liveDeal = isLiveDeal(entry) && liveByCity.get(searchableText(entry.city));
        return liveDeal ? sameTripFare(entry, liveDeal) : null;
      };
      const priceMoves = savedDeals
        .map((entry) => ({ entry, fare: latestFor(entry) }))
        .filter(({ fare }) => fare)
        .map(({ entry, fare }) => fare.price - (entry.savedPrice ?? entry.price));
      if (priceMoves.length) {
        const checkedAt = new Date().toISOString();
        setSavedDeals((current) => current.map((entry) => {
          const fare = latestFor(entry);
          return fare ? {
            ...entry,
            savedPrice: entry.savedPrice ?? entry.price,
            latest: { price: fare.price, link: fare.link || null, airline: fare.airline, airlineCode: fare.airlineCode, originOptions: fare.options, checkedAt },
          } : entry;
        }));
      }
      const drops = priceMoves.filter((change) => change < 0).length;
      if (selectedCountry !== "ALL" && !payload.deals.some((deal) => deal.country === selectedCountry)) setSelectedCountry("ALL");
      setDataMode("live");
      setApiHealth("online");
      const updatedAt = payload.retrievedAt ? new Date(payload.retrievedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      updateLiveStatus(`${payload.deals.length} live ${dest ? `fare${payload.deals.length === 1 ? "" : "s"} to ${dest.name}` : "destinations"} loaded${payload.fallbackUsed ? ` · scanned ${payload.fallbackDestinationsScanned} airports` : ""}${payload.tripDayRangeApproximate ? " · closest available exact dates" : ""}${updatedAt ? ` · updated ${updatedAt}` : ""}${payload.emptyOrigins?.length ? ` · no fares from ${payload.emptyOrigins.join(" or ")}` : ""}${payload.warnings?.length ? " · one airport unavailable" : ""}${drops ? ` · ${drops} saved ${drops === 1 ? "deal is" : "deals are"} cheaper now` : ""}`, "success");
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
  const exploreBudget = () => {
    setSelectedDestination(null);
    setQuery("");
    setLocationSuggestions([]);
    setSavedOnly(false);
    if (window.location.protocol !== "file:" && apiHealth === "online") {
      loadLiveFares({ worldwide: true });
    } else {
      updateLiveStatus(`Showing destinations within MYR ${maxPrice.toLocaleString()}. Load live fares for current prices.`);
    }
  };
  const findCheapestRoute = async () => {
    if (routeLoading) return;
    if (window.location.protocol === "file:") {
      updateLiveStatus("The route finder needs the local API server. Open START_DASHBOARD.cmd.", "error");
      return;
    }
    if (!selectedDestination || !/^[A-Z]{3}$/.test(selectedDestination.id)) {
      updateLiveStatus("Pick a specific destination airport (3-letter code) for the route finder.", "error");
      setLocationSearchOpen(true);
      return;
    }
    if (dateMode !== "specific" || !outboundDate || !returnDate) {
      updateLiveStatus("The route finder needs specific departure and return dates.", "error");
      setDateMode("specific");
      return;
    }
    if (returnDate <= outboundDate) {
      updateLiveStatus("Return date must be after departure date.", "error");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    setRouteLoading(true);
    setRouteOpen(true);
    setRouteResults(null);
    updateLiveStatus(`Scanning direct and connecting routes to ${selectedDestination.name}…`);
    try {
      const params = new URLSearchParams({ origin, stops: stopFilter, arrivalId: selectedDestination.id, arrivalName: selectedDestination.name, outboundDate, returnDate });
      if (selectedDestination.description) params.set("arrivalDescription", selectedDestination.description);
      const response = await fetch(`/api/flights/route?${params}`, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Route finder returned ${response.status}.`);
      if (!Array.isArray(payload.routes) || payload.routes.length === 0) throw new Error(payload.message || "No routes found for these dates.");
      setRouteResults(payload);
      setApiHealth("online");
      const best = payload.routes[0];
      updateLiveStatus(`Cheapest route to ${selectedDestination.name}: MYR ${best.total.toLocaleString()} ${best.type === "direct" ? "direct" : `via ${best.hub.id}`}.`, "success");
    } catch (error) {
      setRouteResults(null);
      setRouteOpen(false);
      const isOffline = error instanceof TypeError || /failed to fetch|networkerror/i.test(error.message);
      if (isOffline) setApiHealth("offline");
      updateLiveStatus(error.name === "AbortError"
        ? "Route search timed out. Please try again."
        : isOffline
          ? "Flight API server is offline. Open START_DASHBOARD.cmd, then try again."
          : error.message, "error");
    } finally {
      window.clearTimeout(timeout);
      setRouteLoading(false);
    }
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
  const projectLocation = (lat, lon) => projectToContainer(lat, lon, mapSize.width, mapSize.height);
  const penangPoint = projectLocation(HOME_AIRPORTS.PEN.lat, HOME_AIRPORTS.PEN.lon);
  const klPoint = projectLocation(HOME_AIRPORTS.KUL.lat, HOME_AIRPORTS.KUL.lon);
  const homePoints = { PEN: penangPoint, KUL: klPoint };
  const mappedDeals = useMemo(() => filtered.filter((deal) => Number.isFinite(deal.lat) && Number.isFinite(deal.lon)), [filtered]);
  // A hovered card or pin can unmount without a mouseleave (e.g. unsaving in the saved
  // view), so only treat a hover as focus while that deal is still shown.
  const hoveredVisible = hoveredId !== null && filtered.some((deal) => deal.id === hoveredId);
  const focusId = (hoveredVisible ? hoveredId : null) ?? selected?.id ?? null;
  const toScreen = (point) => ({
    x: mapSize.width / 2 + (point.x - mapSize.width / 2) * mapZoom + mapPan.x,
    y: mapSize.height / 2 + (point.y - mapSize.height / 2) * mapZoom + mapPan.y,
  });
  const labelSides = useMemo(() => {
    const sides = new Map();
    // Home-airport badges sit up-left of PEN and down-left of KUL; keep labels off them.
    const pen = toScreen(penangPoint);
    const kul = toScreen(klPoint);
    const { width, height } = mapSize;
    const taken = [
      { left: pen.x - 70, right: pen.x + 6, top: pen.y - 34, bottom: pen.y + 6 },
      { left: kul.x - 70, right: kul.x + 6, top: kul.y - 6, bottom: kul.y + 34 },
      // Fixed map overlays: heading, legend, help hint, and zoom controls.
      { left: 0, right: 390, top: 0, bottom: 135 },
      { left: 0, right: 320, top: height - 60, bottom: height },
      { left: width / 2 - 130, right: width / 2 + 130, top: height - 50, bottom: height },
      { left: width - 62, right: width, top: height - 175, bottom: height },
    ];
    const points = new Map(mappedDeals.map((deal) => [deal.id, toScreen(projectLocation(deal.lat, deal.lon))]));
    // Labels never cover another pin's dot, so every pin stays hoverable and clickable.
    const dots = mappedDeals.map((deal) => {
      const point = points.get(deal.id);
      return { id: deal.id, left: point.x - PIN_DOT_RADIUS, right: point.x + PIN_DOT_RADIUS, top: point.y - PIN_DOT_RADIUS, bottom: point.y + PIN_DOT_RADIUS };
    });
    const byPrice = [...mappedDeals].sort((a, b) => (b.id === focusId) - (a.id === focusId) || a.price - b.price);
    for (const deal of byPrice) {
      const point = points.get(deal.id);
      const fits = (box) => !taken.some((other) => boxesOverlap(box, other)) && !dots.some((dot) => dot.id !== deal.id && boxesOverlap(box, dot));
      const side = ["right", "left"].find((candidate) => fits(labelBox(point, deal.city, candidate)))
        || (deal.id === focusId ? "right" : null);
      if (side) {
        sides.set(deal.id, side);
        taken.push(labelBox(point, deal.city, side));
      }
    }
    return sides;
    // projectLocation/toScreen are recreated each render but only depend on
    // mapSize, mapZoom, and mapPan, which are listed.
  }, [mappedDeals, mapSize, mapZoom, mapPan, focusId]);
  const flightArcs = useMemo(() => mapSize.width ? mappedDeals.flatMap((deal) => {
    const to = projectLocation(deal.lat, deal.lon);
    return (deal.origins || [deal.origin]).filter((code) => homePoints[code]).map((code) => ({
      key: `${deal.id}-${code}`,
      dealId: deal.id,
      origin: code.toLowerCase(),
      d: arcPath(homePoints[code], to),
    }));
    // homePoints/projectLocation are recreated each render but only depend on mapSize.
  }) : [], [mappedDeals, mapSize]);

  return (
    <main className="app-shell">
      <FilterPanel {...filterProps} />
      {filtersOpen && <Dialog overlayClassName="mobile-overlay" label="Filters" onClose={() => setFiltersOpen(false)}>
        <FilterPanel mobile close={() => setFiltersOpen(false)} {...filterProps} />
      </Dialog>}

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><Icon>tune</Icon></button>
          <div className="origin-switch" role="group" aria-label="Departure airport">
            {[
              ["ALL", "Both airports"],
              ["PEN", "Penang"],
              ["KUL", "Kuala Lumpur"],
            ].map(([code, label]) => <button key={code} className={origin === code ? "active" : ""} aria-pressed={origin === code} onClick={() => setOrigin(code)}><small>From</small><strong>{label}</strong></button>)}
          </div>
          <div className="search-box-wrap">
            <label className={`search-box ${selectedDestination ? "selected" : ""}`}>
              <Icon>{selectedDestination ? "location_on" : "travel_explore"}</Icon>
              <input ref={searchInputRef} aria-label="Worldwide destination search" value={query} onFocus={() => setLocationSearchOpen(true)} onBlur={() => window.setTimeout(() => setLocationSearchOpen(false), 150)} onChange={(event) => { setQuery(event.target.value); setSelectedDestination(null); setLocationSearchOpen(true); }} placeholder="Search destination airport or code..." autoComplete="off" />
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

        <div className="discovery-actions">
          {selectedDestination ? (
            <button className="route-finder-button" disabled={routeLoading} onClick={findCheapestRoute}>
              <Icon className={routeLoading ? "spin" : ""}>{routeLoading ? "progress_activity" : "route"}</Icon>
              <span>{routeLoading ? "Finding cheapest route…" : `Find cheapest route to ${selectedDestination.name}`}</span>
            </button>
          ) : (
            <button className="budget-explore-button" disabled={liveLoading} onClick={exploreBudget}>
              <Icon className={liveLoading ? "spin" : ""}>{liveLoading ? "progress_activity" : "savings"}</Icon>
              <span>{liveLoading ? "Scanning…" : `Where can MYR ${maxPrice.toLocaleString()} take me?`}</span>
            </button>
          )}
          <button type="button" className="share-button" onClick={shareSearch} title="Copy a link to this search"><Icon>ios_share</Icon><span>Share search</span></button>
          <div className="budget-quickset">
            <span>Budget</span>
            {[1000, 1500, 2500, 4000].map((value) => (
              <button key={value} className={maxPrice === value ? "active" : ""} onClick={() => setBudget(value)}>{(value / 1000).toFixed(value % 1000 ? 1 : 0)}k</button>
            ))}
          </div>
        </div>

        <section ref={mapRef} className={`map-panel ${mapDragging ? "dragging" : ""}`} onWheel={onMapWheel} onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove} onPointerUp={onMapPointerUp} onPointerCancel={onMapPointerUp}>
          <div className="map-scene" style={{ transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})` }}>
            <picture>
              {/* ~100 KB WebP (vs a 2.1 MB PNG kept as the fallback); it is the largest paint on the page. */}
              <source srcSet="./assets/world-map-night.webp" type="image/webp" />
              <img className="world-map" src="./assets/world-map-night.png" alt="Night-time world map" width="1536" height="1024" fetchPriority="high" draggable="false" />
            </picture>
            <div className="radar-sweep" style={{ left: (penangPoint.x + klPoint.x) / 2, top: (penangPoint.y + klPoint.y) / 2 }} aria-hidden="true"><i /><i /><i /></div>
            <svg className={`flight-arcs ${focusId !== null ? "has-focus" : ""}`} width={mapSize.width} height={mapSize.height} aria-hidden="true">
              {flightArcs.map((arc) => <path key={arc.key} d={arc.d} className={`arc origin-${arc.origin} ${arc.dealId === focusId ? "focused" : ""}`} />)}
            </svg>
            <div className="origin-marker pen" style={{ left: penangPoint.x, top: penangPoint.y, "--pin-scale": 1 / mapZoom }}><i className="origin-dot" /><span className="origin-badge"><Icon>flight</Icon> PEN</span></div>
            <div className="origin-marker kul" style={{ left: klPoint.x, top: klPoint.y, "--pin-scale": 1 / mapZoom }}><i className="origin-dot" /><span className="origin-badge"><Icon>flight</Icon> KUL</span></div>
            {mappedDeals.map((deal) => {
              const point = projectLocation(deal.lat, deal.lon);
              const dealOrigins = deal.origins || [deal.origin];
              const originClass = dealOrigins.length > 1 ? "both" : dealOrigins[0]?.toLowerCase();
              return <button data-city={deal.city} key={deal.id} className={`map-pin origin-${originClass} ${deal.id === focusId ? "focused" : ""} ${labelSides.get(deal.id) === "left" ? "label-left" : labelSides.has(deal.id) ? "" : "compact"}`} aria-label={`${deal.city}, MYR ${deal.price.toLocaleString()}`} style={{ left: point.x, top: point.y, "--pin-scale": 1 / mapZoom }} onClick={() => setSelected(deal)} onMouseEnter={() => setHoveredId(deal.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(deal.id)} onBlur={() => setHoveredId(null)}>
                <span className="pin-dot"><Icon>location_on</Icon></span>
                <span className="pin-label"><strong>{deal.city}</strong><small>{dealOrigins.length > 1 ? "PEN + KUL" : dealOrigins[0]} · MYR {deal.price.toLocaleString()}</small></span>
              </button>;
            })}
          </div>
          <div className="map-shade" />
          <div className="map-heading">
            <span>{savedOnly ? "YOUR SAVED DEALS" : dataMode === "live" ? "LIVE FARE DISCOVERY" : "DEMO DISCOVERY MAP"}</span>
            <h2>{savedOnly ? `${filtered.length} saved ${filtered.length === 1 ? "deal" : "deals"}` : selectedDestination ? `${filtered.length} fares to ${selectedDestination.name}` : `${filtered.length} places within your budget`}</h2>
            <p>{dateMode === "specific" && outboundDate && returnDate
              ? `${outboundDate} to ${returnDate}`
              : dateMode === "month"
                ? `${travelMonth} · ${minTripDays}–${maxTripDays} days`
                : "Flexible return fares from Penang and Kuala Lumpur"}</p>
          </div>
          <div className="map-legend origin-legend"><span><i className="legend-dot pen" />From Penang</span><span><i className="legend-dot kul" />From Kuala Lumpur</span><span><i className="legend-dot both" />Both airports</span></div>
          <div className="map-help"><Icon>open_with</Icon> Drag to pan · scroll to zoom · press / to search</div>
          <div className="map-controls">
            <button onClick={() => setZoom(mapZoom + 0.25)} disabled={mapZoom >= 3.5} aria-label="Zoom in"><Icon>add</Icon></button>
            <button onClick={() => setZoom(mapZoom - 0.25)} disabled={mapZoom <= 1} aria-label="Zoom out"><Icon>remove</Icon></button>
            <button onClick={resetMapView} aria-label="Reset map view"><Icon>my_location</Icon></button>
          </div>
          <div className="zoom-level">{Math.round(mapZoom * 100)}%</div>
        </section>

        <section className="deals-section">
          <div className="deals-heading">
            <div>{savedOnly
              ? <><span>YOUR</span><h2>SAVED DEALS</h2></>
              : <><span>BEST DEALS FROM</span><h2>{origin === "PEN" ? "PENANG" : origin === "KUL" ? "KUALA LUMPUR" : "PENANG & KUALA LUMPUR"}</h2></>}</div>
            <p className={`live-status ${liveStatusKind}`} role="status" aria-live="polite">{liveStatus}</p>
            <button type="button" className="export-button" onClick={exportCsv} disabled={!filtered.length}><Icon>download</Icon><span>Export CSV</span></button>
            <label>Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price">Price: low to high</option>
                <option value="days">Shortest trip</option>
                <option value="city">Destination A–Z</option>
              </select>
            </label>
          </div>
          {!savedOnly && !selectedDestination && nonPriceMatches.length >= 2 && <FareSpread prices={nonPriceMatches.map((deal) => deal.price)} minPrice={minPrice} maxPrice={maxPrice} onPick={setBudget} />}
          {budgetSummary && <div className="budget-banner">
            <div className="budget-banner-main">
              <span>BUDGET REACH</span>
              <strong>{budgetSummary.count} {budgetSummary.count === 1 ? "destination" : "destinations"} within MYR {budgetSummary.budget.toLocaleString()}</strong>
            </div>
            <div className="budget-banner-stats">
              <span><small>Median fare</small><b>MYR {budgetSummary.median.toLocaleString()}</b></span>
              <span><small>Direct flights</small><b>{budgetSummary.direct} of {budgetSummary.count}</b></span>
            </div>
            <button type="button" className="budget-banner-pick" onClick={() => setSelected(budgetSummary.cheapest)}>
              <small>Cheapest</small>
              <b>{budgetSummary.cheapest.city}</b>
              <span className="budget-banner-price">MYR {budgetSummary.cheapest.price.toLocaleString()}</span>
            </button>
          </div>}
          <div className="deal-rail">
            {filtered.length ? filtered.map((deal) => <DealCard key={deal.id} deal={deal} saved={saved.includes(deal.id)} onSave={toggleSave} onOpen={setSelected} highlighted={deal.id === focusId} onHover={setHoveredId} priceChange={priceChangeFor(deal)} />) : (
              <div className="empty-state">
                <Icon>{savedOnly ? "bookmark" : selectedDestination ? "travel_explore" : weatherFilter ? "rainy" : "flight_takeoff"}</Icon>
                <h3>{savedOnly ? "No saved deals yet" : selectedDestination && dataMode === "demo" ? `Search fares to ${selectedDestination.name}` : "No fares match those filters"}</h3>
                <p>{savedOnly
                  ? "Tap the bookmark on any fare to keep it here, even after new searches."
                  : selectedDestination && dataMode === "demo"
                  ? "Run a live search to find current fares for this destination and trip range."
                  : weatherFilter
                    ? `No destination has ${minDryPercent}% forecast dry days for this trip.`
                    : "Try wider travel dates, trip days, or fare range."}</p>
                <button onClick={savedOnly ? () => setSavedOnly(false) : selectedDestination && dataMode === "demo" ? loadLiveFares : reset}>{savedOnly ? "Browse deals" : selectedDestination && dataMode === "demo" ? "Search live fares" : "Reset filters"}</button>
              </div>
            )}
          </div>
        </section>
      </section>

      {selected && <Dialog className="deal-drawer" label={`${selected.city} deal`} onClose={() => setSelected(null)}>
          <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close deal"><Icon>close</Icon></button>
          <img src={selected.image} alt="" />
          <div className="drawer-content">
            <span className="eyebrow">DISCOVERED DEAL</span>
            <h2>{selected.city}</h2><p className="drawer-country">{selected.country}</p>
            <div className="drawer-price"><small>Cheapest return fare from {selected.origin === "BOTH" ? "Penang or Kuala Lumpur" : selected.origin}</small><strong>MYR {selected.price.toLocaleString()}</strong></div>
            <PriceChange change={priceChangeFor(selected)} className="drawer-price-change" />
            {selected.originOptions?.length > 0 && <div className="route-options">
              {selected.originOptions.map((option) => <a key={option.origin} className={`route-option origin-${option.origin.toLowerCase()}`} href={option.link || "#"} target="_blank" rel="noreferrer">
                <span><b>{option.origin}</b><small>{option.airline}{option.airlineCode ? ` · ${option.airlineCode}` : ""}</small></span><strong>MYR {option.price.toLocaleString()}</strong>
              </a>)}
            </div>}
            <div className="drawer-grid"><span><Icon>calendar_month</Icon><small>Travel dates</small><b>{selected.date}</b></span><span><Icon>schedule</Icon><small>Trip length</small><b>{selected.days} days</b></span><span><Icon>connecting_airports</Icon><small>Stops</small><b>{selected.stops === 0 ? "Direct" : `${selected.stops} stop${selected.stops > 1 ? "s" : ""}`}</b></span><span><Icon>airlines</Icon><small>Airline</small><b>{selected.airline || "Live fares only"}</b></span><span><Icon>partly_cloudy_day</Icon><small>Dry-day forecast</small><b>{selected.weather?.available ? `${selected.weather.dryPercent}% · ${selected.weather.dryDays}/${selected.weather.totalDays} days` : "Unavailable beyond 16 days"}</b></span><span><Icon>public</Icon><small>Country</small><b>{selected.country}</b></span></div>
            <a className="secondary-button" href={googleFlightsSearchUrl(selected, origin)} target="_blank" rel="noreferrer"><Icon>open_in_new</Icon>Search this trip on Google Flights</a>
            <button className="primary-button" onClick={() => toggleSave(selected)}><Icon>{saved.includes(selected.id) ? "bookmark_added" : "bookmark_add"}</Icon>{saved.includes(selected.id) ? "Saved to your deals" : "Save this deal"}</button>
            <p className="drawer-note">{selected.theme === "Live" ? "Live fare discovered through Google Travel Explore. Open an airport offer above to continue." : "Demo fare. Load live fares to see current airlines and booking links."}</p>
          </div>
      </Dialog>}

      {routeOpen && <Dialog className="route-drawer" label="Cheapest route finder" onClose={() => setRouteOpen(false)}>
          <button className="drawer-close" onClick={() => setRouteOpen(false)} aria-label="Close route finder"><Icon>close</Icon></button>
          <div className="route-drawer-head">
            <span className="eyebrow">CHEAPEST ROUTE FINDER</span>
            <h2>Ways to reach {routeResults?.destination?.name || selectedDestination?.name}</h2>
            {routeResults && <p>{routeResults.dates[0]} → {routeResults.dates[1]} · scanned {routeResults.hubsScanned} hub{routeResults.hubsScanned === 1 ? "" : "s"} from {routeResults.searchedOrigins.join(" & ")}</p>}
          </div>
          {routeLoading && <div className="route-loading"><Icon className="spin">progress_activity</Icon> Scanning direct and connecting routes…</div>}
          {routeResults && <div className="route-list">
            {routeResults.routes.map((route, index) => {
              const path = [...route.legs.map((leg) => leg.from), route.legs[route.legs.length - 1].to].join(" → ");
              return <div key={route.id} className={`route-card ${index === 0 ? "best" : ""}`}>
                <div className="route-card-top">
                  <span className="route-path">{path}</span>
                  <strong>MYR {route.total.toLocaleString()}</strong>
                </div>
                <div className="route-tags">
                  {index === 0 && <span className="tag best">Cheapest</span>}
                  <span className="tag">{route.type === "direct" ? "Direct booking" : `Connect via ${route.hub.name}`}</span>
                  {route.savingsVsDirect > 0 && <span className="tag saves">Saves MYR {route.savingsVsDirect.toLocaleString()}</span>}
                  {route.savingsVsDirect < 0 && <span className="tag over">+MYR {Math.abs(route.savingsVsDirect).toLocaleString()} vs direct</span>}
                </div>
                <div className="route-legs">
                  {route.legs.map((leg, legIndex) => (
                    <a key={legIndex} className="route-leg" href={leg.link || "#"} target="_blank" rel="noreferrer" onClick={(e) => { if (!leg.link) e.preventDefault(); }}>
                      <span className="route-leg-path"><b>{leg.from} → {leg.to}</b><small>{leg.airline || "Airline on booking"}{leg.airlineCode ? ` · ${leg.airlineCode}` : ""}</small></span>
                      <span className="route-leg-price">MYR {leg.price.toLocaleString()}</span>
                    </a>
                  ))}
                </div>
              </div>;
            })}
            <p className="route-disclaimer"><Icon>info</Icon><span>{routeResults.disclaimer}</span></p>
          </div>}
      </Dialog>}
    </main>
  );
}
