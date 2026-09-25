# Global Radar Flight Dashboard

A modern flight-discovery dashboard for finding affordable worldwide trips from Penang (`PEN`) and Kuala Lumpur (`KUL`).

## Features

- Live fare discovery through SerpApi Google Travel Explore
- Airport-only worldwide destination search
- Exact departure and return dates on every displayed live fare
- Specific dates or flexible month and trip-length searches
- Minimum and maximum fare filtering
- Separate PEN, KUL, and both-airport results
- Airline, stops, country, weather, sorting, and saved-deal controls
- Zoomable worldwide radar map with animated flight-path arcs; hovering a pin or fare card highlights its route
- Budget insights: destinations in reach, median fare, direct-flight count, and cheapest pick
- Saved deals and filter preferences persist in the browser, including saved live fares
- Map labels declutter automatically: cheaper fares keep their labels, others flip sides or collapse to a dot that expands on hover; zooming in reveals more
- Shareable searches: the address bar tracks airport, fare range, stops, dates, and destination, and **Share search** copies the link
- Every deal links straight to a matching Google Flights search
- Keyboard shortcuts: `/` focuses destination search, `Esc` closes panels
- Server-side 10-minute cache of SerpApi responses so repeated searches do not spend extra quota (hit/miss counts at `/api/status`)

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

See [API_SETUP.md](API_SETUP.md) for additional setup and troubleshooting details.

## Privacy

The SerpApi key is read only by the local Node.js backend. Private `.env` files, dependencies, generated builds, browser profiles, screenshots, and internal test artifacts are excluded from Git.

## APIs

- [SerpApi Google Travel Explore](https://serpapi.com/google-travel-explore-api)
- [SerpApi Google Flights Autocomplete](https://serpapi.com/google-flights-autocomplete-api)
- [Open-Meteo](https://open-meteo.com/en/docs)
