// Two simulated iPhones (Isak and Lucas) sharing one tracker through a stand-in sync server.
// Needs a Postgres with sync/supabase-setup.sql applied (see .github/workflows/test.yml).
// Run: node tests/sync.test.js
const { serve, check, failed, phone, sheetClosed, tab, text, chromium } = require("./helpers");
const mock = require("./mock-supabase");

const APP = 8782, API = 8783, URL = `http://127.0.0.1:${APP}/`;
const pointAtMock = (html) => html
  .replaceAll("https://YOUR-PROJECT.supabase.co", `http://127.0.0.1:${API}`)
  .replace("YOUR-PUBLISHABLE-KEY", mock.API_KEY);

const settle = (p) => p.evaluate(async () => { await syncNow(); while (syncing) await new Promise((r) => setTimeout(r, 50)); });
const txs = (p) => p.evaluate(() => state.transactions);

async function addExpense(p, amount, note) {
  await tab(p, "activity");
  await p.click("#addBtn");
  await p.fill("#txAmount", amount);
  await p.fill("#txNote", note);
  await p.click("[data-sheet=confirm]");
  await sheetClosed(p);
}

(async () => {
  await mock.psql("truncate records;", {});
  const appServer = await serve(APP, pointAtMock);
  const apiServer = await mock.start(API);
  const browser = await chromium.launch();
  const isak = await phone(browser, URL, "Isak");
  const lucas = await phone(browser, URL, "Lucas");

  // Isak sets things up and starts sharing
  await addExpense(isak, "80", "Big shop");
  await tab(isak, "bills");
  await isak.click("#addBtn"); await isak.fill("#bName", "Rent"); await isak.fill("#bAmount", "950");
  await isak.click("[data-sheet=confirm]"); await sheetClosed(isak);
  await tab(isak, "vouchers");
  await isak.click("#voucherBox [data-action=addvoucher]"); await isak.fill("#vValue", "100"); await isak.fill("#vCost", "95");
  await isak.click("[data-sheet=confirm]"); await sheetClosed(isak);
  await tab(isak, "settings");
  await isak.click("[data-share=start]");
  await isak.click("[data-sheet=confirm]");
  await isak.waitForSelector("#inviteCode");
  const code = await isak.textContent("#inviteCode");
  check("invite code format", /^jf-[a-z2-7]{26}-[a-z2-7]{26}$/.test(code));
  await isak.click("[data-sheet=confirm]"); await sheetClosed(isak);

  // Lucas joins
  await tab(lucas, "settings");
  await lucas.click("[data-share=join]");
  await lucas.fill("#shareCode", "jf-nonsense");
  check("join disabled for malformed code", await lucas.isDisabled("[data-sheet=confirm]"));
  await lucas.fill("#shareCode", code.toUpperCase());
  await lucas.click("[data-sheet=confirm]"); await sheetClosed(lucas);
  check("Lucas is person 2", await lucas.evaluate(() => sync.me === "p2"));
  check("Lucas gets the expense, bill and voucher", await lucas.evaluate(() => state.transactions.length === 1 && state.bills.length === 1 && state.vouchers.length === 1));

  // Lucas logs a shop with the voucher -> Isak sees it, labelled
  await tab(lucas, "vouchers");
  await lucas.click("#voucherBox [data-action=logshop]");
  await lucas.fill("#shopAmount", "108");
  await lucas.fill("#shopNote", "Tesco");
  await lucas.click("[data-sheet=confirm]"); await sheetClosed(lucas);
  await settle(lucas); await settle(isak);
  const shop = (await txs(isak)).find((t) => t.note === "Tesco");
  check("Isak receives Lucas's shop with voucher split", !!shop && shop.amount === 10800 && shop.voucher === 10000 && shop.by === "p2");
  await tab(isak, "activity");
  check('Isak sees "added by Lucas"', (await text(isak, "#txList")).includes("added by Lucas"));
  check("voucher balance agrees on both phones", (await isak.evaluate(() => voucherSummary().balance)) === 0 && (await lucas.evaluate(() => voucherSummary().balance)) === 0);

  // Isak pays the bill -> Lucas sees it paid
  await tab(isak, "bills");
  await isak.click("[data-pay]"); await isak.click("[data-sheet=confirm]"); await sheetClosed(isak);
  await settle(isak); await settle(lucas);
  await tab(lucas, "bills");
  check("bill paid on Lucas's phone", (await text(lucas, "#billsBox")).includes("£950.00 of £950.00 paid"));

  // Edits and deletes both ways
  const big = (await txs(lucas)).find((t) => t.note === "Big shop");
  await tab(lucas, "activity");
  await lucas.click(`#txList [data-edit="${big.id}"]`);
  await lucas.click('[data-seg="split"] [data-val="p1"]');
  await lucas.click("[data-sheet=confirm]"); await sheetClosed(lucas);
  await settle(lucas); await settle(isak);
  check("split change syncs", (await isak.evaluate((id) => shares(state.transactions.find((t) => t.id === id)).join(), big.id)) === "8000,0");
  await tab(isak, "activity");
  await isak.click(`#txList [data-edit="${shop.id}"]`); await isak.click("[data-sheet=delete]"); await sheetClosed(isak);
  await settle(isak); await settle(lucas);
  check("delete syncs, voucher balance restored", !(await txs(lucas)).some((t) => t.id === shop.id) && (await lucas.evaluate(() => voucherSummary().balance)) === 10000);

  // Rename syncs through settings
  await tab(lucas, "settings");
  await lucas.fill("#nameP2", "Luke"); await lucas.press("#nameP2", "Enter");
  await settle(lucas); await settle(isak);
  check("name change syncs", (await isak.evaluate(() => state.settings.people.p2)) === "Luke");

  // Conflict: later edit wins on both
  await isak.evaluate((id) => { const t = state.transactions.find((t) => t.id === id); t.note = "by Isak"; touch(t); save(true); }, big.id);
  await new Promise((r) => setTimeout(r, 30));
  await lucas.evaluate((id) => { const t = state.transactions.find((t) => t.id === id); t.note = "by Lucas, later"; touch(t); save(true); }, big.id);
  await settle(isak); await settle(lucas); await settle(isak);
  const ni = (await txs(isak)).find((t) => t.id === big.id).note, nl = (await txs(lucas)).find((t) => t.id === big.id).note;
  check("conflict: later edit wins on both", ni === "by Lucas, later" && nl === ni);

  const norm = (s) => JSON.stringify(["transactions", "bills", "vouchers", "categories"].map((k) =>
    s[k].map(({ updatedAt, ...r }) => r).sort((a, b) => a.id.localeCompare(b.id))));
  check("both phones hold identical data", norm(await isak.evaluate(() => state)) === norm(await lucas.evaluate(() => state)));

  // The server only ever sees scrambled data
  const dump = await mock.psql("select string_agg(coalesce(data, ''), ' ') from records;", {});
  check("server holds no readable data", !/Tesco|Rent|Luke|Isak|Big shop|Food/.test(dump));

  // Outage and recovery
  mock.setDown(true);
  await addExpense(lucas, "4.20", "while offline");
  await settle(lucas);
  await tab(lucas, "settings");
  check("outage shown", /Sync problem|Offline/.test(await text(lucas, "#sharingBox")));
  mock.setDown(false);
  await settle(lucas); await settle(isak);
  check("offline change arrives later", (await txs(isak)).some((t) => t.note === "while offline"));

  // Wrong code is refused and leaves the phone alone
  const eve = await phone(browser, URL, "Eve");
  await addExpense(eve, "1", "eve's own");
  await tab(eve, "settings");
  await eve.click("[data-share=join]");
  const wrong = code.slice(0, 30) + (code[30] === "a" ? "b" : "a") + code.slice(31);
  await eve.fill("#shareCode", wrong);
  await eve.click("[data-sheet=confirm]");
  await eve.waitForFunction(() => /doesn't unlock/.test(document.getElementById("shareError").textContent));
  check("wrong secret refused, data untouched", (await txs(eve)).length === 1 && (await eve.evaluate(() => sync)) === null);

  for (const p of [isak, lucas, eve]) check(`${p.label}: no page errors`, p.errs.filter((e) => !/503|Failed to load resource/.test(e)).length === 0, p.errs.join(" | "));
  await browser.close();
  appServer.close(); apiServer.close();
  console.log(failed() ? `${failed()} FAILED` : "ALL PASSED");
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
