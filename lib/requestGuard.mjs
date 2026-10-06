// Request checks for the local dashboard server, which holds the SerpApi key.
//
// - Host allow-list: a DNS-rebinding page (evil.example resolving to 127.0.0.1)
//   reaches this server with `Host: evil.example`, so only loopback names (plus any
//   ALLOWED_HOSTS the operator configures) are served.
// - Cross-site API block: any web page can fire GET requests at 127.0.0.1 (images,
//   no-cors fetch) and spend search quota even without reading the result. Browsers
//   label those with `Sec-Fetch-Site: cross-site` and a foreign `Origin`.

const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"];

export function allowedHostsFor(port, extraHosts = "") {
  const extras = String(extraHosts).split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  return new Set([...LOOPBACK_NAMES.map((name) => `${name}:${port}`), ...extras]);
}

export function isAllowedHost(hostHeader, allowedHosts) {
  return typeof hostHeader === "string" && allowedHosts.has(hostHeader.trim().toLowerCase());
}

// True when a browser says this request came from another site. Requests without
// these headers (curl, the dashboard opened directly) are not cross-site.
export function isCrossSiteRequest(headers, allowedHosts) {
  if (headers["sec-fetch-site"] === "cross-site") return true;
  const origin = headers.origin;
  if (!origin || origin === "null") return origin === "null";
  try {
    return !allowedHosts.has(new URL(origin).host.toLowerCase());
  } catch {
    return true;
  }
}
