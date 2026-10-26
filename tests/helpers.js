// Shared test helpers: a tiny static web server and simulated iPhones.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".csv": "text/csv" };

// Serve the app folder. `transform` can rewrite index.html (used to point sync at a test server).
function serve(port, transform) {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (file.endsWith("/")) file += "index.html";
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      if (transform && file.endsWith("index.html")) data = transform(data.toString());
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

let failures = 0;
function check(name, ok, extra = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!ok) failures++;
}
const failed = () => failures;

async function phone(browser, url, label, opts = {}) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...opts });
  const p = await ctx.newPage();
  p.errs = [];
  p.label = label;
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && p.errs.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(url);
  return p;
}

const sheetClosed = (p) => p.waitForSelector("#scrim.hidden", { state: "attached" });
const tab = (p, name) => p.click(`#tabbtn-${name}`);
const text = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, " ").trim();

module.exports = { serve, check, failed, phone, sheetClosed, tab, text, chromium };
