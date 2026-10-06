import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { allowedHostsFor, isAllowedHost, isCrossSiteRequest } from "./requestGuard.mjs";

// Count would-be SerpApi calls instead of making them.
let upstreamCalls = 0;
globalThis.fetch = async () => {
  upstreamCalls += 1;
  return new Response(JSON.stringify({ suggestions: [] }));
};
process.env.SERPAPI_KEY = "test-key";
const { server } = await import("../server.mjs");

let port;
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

// Raw HTTP so tests control the Host header and keep paths unnormalised.
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("serves the API to the dashboard's own loopback address", async () => {
  const res = await get("/api/status");
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).keyConfigured, true);
  assert.equal((await get("/api/status", { host: `localhost:${port}` })).status, 200);
});

test("never echoes the API key", async () => {
  const res = await get("/api/status");
  assert.ok(!res.body.includes("test-key"));
});

test("rejects DNS-rebinding requests addressed to another host", async () => {
  const res = await get("/api/flights/locations?q=tokyo", { host: `evil.example:${port}` });
  assert.equal(res.status, 421);
  assert.equal((await get("/", { host: "evil.example" })).status, 421);
});

test("blocks cross-site API calls before they spend SerpApi quota", async () => {
  const before = upstreamCalls;
  const crossSite = await get("/api/flights/locations?q=tokyo", { "sec-fetch-site": "cross-site" });
  assert.equal(crossSite.status, 403);
  const foreignOrigin = await get("/api/flights/locations?q=paris", { origin: "https://evil.example" });
  assert.equal(foreignOrigin.status, 403);
  assert.equal(upstreamCalls, before, "no SerpApi request should be made");
});

test("allows same-origin API calls from the dashboard page", async () => {
  const before = upstreamCalls;
  const res = await get("/api/flights/locations?q=osaka", { "sec-fetch-site": "same-origin", origin: `http://127.0.0.1:${port}` });
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls, before + 1);
});

test("does not serve files outside the build folder", async () => {
  for (const path of ["/../server.mjs", "/..%2Fserver.mjs", "/%2e%2e/server.mjs", "/../.env"]) {
    const res = await get(path);
    assert.ok(!res.body.includes("SERPAPI_KEY") && !res.body.includes("createServer"), `${path} leaked a file`);
  }
});

test("request guard helpers", () => {
  const allowed = allowedHostsFor(4174, "radar.lan:4174, Other.Host:8080");
  assert.ok(isAllowedHost("127.0.0.1:4174", allowed));
  assert.ok(isAllowedHost("LOCALHOST:4174", allowed));
  assert.ok(isAllowedHost("radar.lan:4174", allowed));
  assert.ok(isAllowedHost("other.host:8080", allowed));
  assert.ok(!isAllowedHost("127.0.0.1:9999", allowed));
  assert.ok(!isAllowedHost(undefined, allowed));
  assert.equal(isCrossSiteRequest({}, allowed), false);
  assert.equal(isCrossSiteRequest({ "sec-fetch-site": "same-origin" }, allowed), false);
  assert.equal(isCrossSiteRequest({ "sec-fetch-site": "none" }, allowed), false);
  assert.equal(isCrossSiteRequest({ origin: "http://localhost:4174" }, allowed), false);
  assert.equal(isCrossSiteRequest({ origin: "null" }, allowed), true);
  assert.equal(isCrossSiteRequest({ origin: "not a url" }, allowed), true);
});
