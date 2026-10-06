import { monthValue } from "../dates.js";
import { Icon } from "./Icon.jsx";

export function FilterPanel({ minPrice, setMinPrice, maxPrice, setMaxPrice, stopFilter, setStopFilter, themes, toggleTheme, reset, dateMode, setDateMode, outboundDate, setOutboundDate, returnDate, setReturnDate, travelMonth, setTravelMonth, minTripDays, setMinTripDays, maxTripDays, setMaxTripDays, selectedCountry, setSelectedCountry, countries, weatherFilter, setWeatherFilter, minDryPercent, setMinDryPercent, mobile = false, close }) {
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
