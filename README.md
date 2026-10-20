# Global Radar Flight Dashboard

A modern flight-discovery dashboard for finding affordable worldwide trips from Penang (`PEN`) and Kuala Lumpur (`KUL`).

## Features

### Search flights (Google Flights-style)

Switch to **Search flights** for a route search like Google Flights: from Penang, Kuala Lumpur, or up to three departure airports of your choice (for example adding Singapore or Johor Bahru, often cheaper for long-haul); any destination airport; round trip or one way; dates; adults, children, and lap infants; cabin class; and carry-on bags. Results show times, duration, stops and layovers, emissions, and price, with full leg-by-leg details. For round trips, pick an outbound flight, then choose its return and book on Google Flights.

Filters go further than Google Flights and apply instantly without spending extra searches:

- Stops, airlines, and departure airport (each with its cheapest fare), and maximum price
- Departure and arrival time windows, maximum trip duration, and avoiding red-eye flights
- Minimum layover (avoid tight connections) and maximum layover, avoiding overnight layovers, and excluding specific connecting airports
- Hiding flights often delayed 30+ minutes, and lower-emission flights only
- Comfort, which Google Flights cannot filter: minimum legroom, Wi-Fi, in-seat power/USB, and entertainment on every leg, and excluding aircraft types (grouped by family, e.g. Boeing 787)
- Sort by best, cheapest, fastest, earliest or latest departure, earliest arrival, or lowest emissions; price insight shows whether fares are low, typical, or high for the route
- Price history chart for the route (from Google Flights price insights, no extra searches), with the typical price range marked
- Compare nearby dates (±1 or ±3 days, same trip length) to find the cheapest day; the button shows how many searches it will use, and switching to a compared date is served from cache
- Saved filter sets: name the current filters (for example "Comfortable") and re-apply them to any search with one click
- Tracked routes: track a search to watch its price; every later search of that route records the cheapest fare for free, and the list shows the change since you started tracking, with a one-click "Check price"
- Shareable flight searches: the address bar carries the route, dates, travellers, cabin, and bags, and a shared link opens straight onto its results

### Explore map

- Live fare discovery through SerpApi Google Travel Explore
- Airport-only worldwide destination search
- Exact departure and return dates on every displayed live fare
- Specific dates or flexible month and trip-length searches
- Minimum and maximum fare filtering
- Separate PEN, KUL, and both-airport results
- Airline, stops, country, weather, sorting, and saved-deal controls
- Zoomable worldwide radar map with animated flight-path arcs; hovering a pin or fare card highlights its route
- Budget insights: destinations in reach, median fare, direct-flight count, and cheapest pick
- Fare spread chart: a histogram of fares in MYR 500 bands that shows what a bigger budget would unlock; pick a bar to set the maximum fare
- Export the current results (or saved deals) as a spreadsheet-ready CSV
- Saved deals and filter preferences persist in the browser, including saved live fares
- Price tracking: saved live fares remember their price, and a later live search that prices the same trip (city, departure airport, and dates) shows how much it has gone up or down
- Pins are placed with a projection calibrated to the map artwork (Patterson cylindrical), so cities land on the right spot
- Map labels declutter automatically: cheaper fares keep their labels, others flip sides or collapse to a dot that expands on hover; zooming in reveals more
- Shareable searches: the address bar tracks airport, fare range, stops, dates, and destination, and **Share search** copies the link; opening a shared link applies it for that visit without overwriting your own saved preferences
- Every deal links straight to a matching Google Flights search
- Keyboard and screen-reader friendly: deals open with Tab + Enter, panels behave as modal dialogs, and search status is announced
- Keyboard shortcuts: `/` focuses destination search, `Esc` closes panels
- Server-side 10-minute cache of SerpApi responses, and identical in-flight requests are shared, so repeated searches do not spend extra quota (counts at `/api/status`)
- Lightweight first load: the map ships as a ~100 KB WebP (PNG fallback) and the icon font is subset to the icons in use (~15 KB instead of ~1.4 MB)

## Run Locally

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a private `.env` file:

   ```text
   SERPAPI_KEY=your_serpapi_key_here
   PORT=4174
   ```

3. Build and start:

   ```powershell
   npm run build
   npm start
   ```

4. Open `http://127.0.0.1:4174`.

Run the unit tests with `npm test`. GitHub Actions runs the tests, the production build, and a server smoke test on every push and pull request (`.github/workflows/ci.yml`). They cover the map projection calibration (`src/mapProjection.js`) and the fare logic the API server uses to merge, filter, and rank fares and connecting routes (`lib/fares.mjs`); no API key or network access is needed.

See [API_SETUP.md](API_SETUP.md) for additional setup and troubleshooting details.

## Privacy and security

The SerpApi key is read only by the local Node.js backend. The backend listens on `127.0.0.1` only, answers only requests addressed to `127.0.0.1` or `localhost` (blocking DNS-rebinding attacks), and refuses API calls that browsers mark as coming from another website, so other pages cannot spend your search quota. To reach it under another name (for example through a local reverse proxy), list it in `.env` as `ALLOWED_HOSTS=radar.lan:4174`. Private `.env` files, dependencies, generated builds, browser profiles, screenshots, and internal test artifacts are excluded from Git.

## APIs

- [SerpApi Google Travel Explore](https://serpapi.com/google-travel-explore-api)
- [SerpApi Google Flights Autocomplete](https://serpapi.com/google-flights-autocomplete-api)
- [Open-Meteo](https://open-meteo.com/en/docs)
