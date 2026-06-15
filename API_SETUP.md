# Live Flight API Setup

This dashboard is wired to the SerpApi Google Travel Explore API.

1. Create a free SerpApi account: https://serpapi.com/users/sign_up
2. Copy the private API key from the SerpApi dashboard.
3. Put the key in a private `.env` file beside `server.mjs`:

```text
SERPAPI_KEY=your-key
```

4. Run `START_DASHBOARD.cmd`.
5. Open `http://127.0.0.1:4174` and select **Load live fares**.

Keep the key private. Do not add it to frontend HTML or commit it to source control.

## Troubleshooting

- **API ready** means the local server is running and found the private key.
- **API offline** means `START_DASHBOARD.cmd` needs to be run again.
- Check `http://127.0.0.1:4174/api/status` to confirm the local API connection without exposing the key.
- SerpApi's free plan has a monthly search limit. Searching both airports or several trip-duration groups uses multiple searches.

## Weather Filter

The dry-weather filter uses the free Open-Meteo forecast API and does not require another API key.

- It works only for specific trips ending within the next 16 days.
- A dry day is defined as less than 1mm of forecast precipitation.
- Weather forecasts are estimates, not guarantees.
