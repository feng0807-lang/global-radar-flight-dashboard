import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The icon font is requested with Google Fonts' icon_names subset, so an icon used in
// the app but missing from that list would render as its ligature text ("bookmark").
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function iconsUsedInApp() {
  const names = new Set();
  const unresolved = [];
  for (const [, rawBody] of app.matchAll(/<Icon\b[^>]*>([\s\S]*?)<\/Icon>/g)) {
    const body = rawBody.trim();
    if (/^[a-z_]+$/.test(body)) {
      names.add(body);
      continue;
    }
    // Expressions like {saved ? "bookmark_added" : "bookmark"}: take the ternary branches.
    const found = [...body.matchAll(/(?:^\{|[?:])\s*"([a-z_]+)"/g)].map((match) => match[1]);
    if (!found.length) unresolved.push(body);
    found.forEach((name) => names.add(name));
  }
  return { names, unresolved };
}

const subset = css.match(/Material\+Symbols\+Rounded[^"]*icon_names=([a-z_,]+)/)?.[1]?.split(",") ?? [];

test("the icon font subset lists every icon the app renders", () => {
  const { names, unresolved } = iconsUsedInApp();
  assert.deepEqual(unresolved, [], "an <Icon> takes its name from a variable; use string literals so the subset can be checked");
  const missing = [...names].filter((name) => !subset.includes(name));
  assert.deepEqual(missing, [], `add these to icon_names in src/styles.css: ${missing.join(", ")}`);
});

test("the icon_names list is sorted and has no unused entries", () => {
  assert.ok(subset.length > 0, "icon_names not found in src/styles.css");
  assert.deepEqual(subset, [...subset].sort(), "Google Fonts expects icon_names in alphabetical order");
  const { names } = iconsUsedInApp();
  const unused = subset.filter((name) => !names.has(name));
  assert.deepEqual(unused, [], `remove unused icon_names: ${unused.join(", ")}`);
});
