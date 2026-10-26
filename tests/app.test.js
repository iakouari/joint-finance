// End-to-end tests of Joint Finance Tracker on a simulated iPhone.
// Run: node tests/app.test.js
const { serve, check, failed, phone, sheetClosed, tab, text, chromium } = require("./helpers");

const PORT = 8781, URL = `http://127.0.0.1:${PORT}/`;
const today = new Date();
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

async function addExpense(p, amount, note, opts = {}) {
  await p.click("#addBtn");
  await p.fill("#txAmount", amount);
  if (opts.category) await p.selectOption("#txCategory", { label: opts.category });
  await p.fill("#txNote", note);
  if (opts.split) await p.click(`[data-seg="split"] [data-val="${opts.split}"]`);
  if (opts.p1) await p.fill("#shareP1", opts.p1);
  await p.click("[data-sheet=confirm]");
  await sheetClosed(p);
}

(async () => {
  const server = await serve(PORT);
  const browser = await chromium.launch();

  // ---------- Migration from Pocket Ledger ----------
  const old = await phone(browser, URL, "migration");
  await old.evaluate((d) => {
    localStorage.clear();
    localStorage.setItem("pocketLedger.v1", JSON.stringify({
      version: 1,
      categories: [{ id: "c1", name: "Groceries", kind: "expense" }, { id: "c2", name: "Salary", kind: "income" }],
      transactions: [{ id: "t1", date: d, amount: 1250, categoryId: "c1", note: "old shop" }, { id: "t2", date: d, amount: 200000, categoryId: "c2", note: "pay" }],
      settings: { savingsGoal: 30000 },
    }));
  }, iso(today));
  await old.reload();
  const m = await old.evaluate(() => ({ s: state.transactions.map((t) => ({ split: t.split, from: t.from })), keepsOld: !!localStorage.getItem("pocketLedger.v1"), saved: !!localStorage.getItem("jointFinance.v2") }));
  check("old spending becomes Isak-only", m.s[0].split && m.s[0].split.mode === "p1");
  check("old income becomes paid in by Isak", m.s[1].from === "p1");
  check("old data kept as a safety copy", m.keepsOld && m.saved);
  await old.context().close();

  // ---------- Fresh phone ----------
  const p = await phone(browser, URL, "main");
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  check("rebranded title", (await p.title()) === "Joint Finance Tracker");
  check("five tabs", (await p.$$(".tabbar button")).length === 5);

  // 50/50 expense
  await addExpense(p, "80", "Big shop", { category: "Food shop" });
  check("home shows £80 this week", (await text(p, "#homeCards")).includes("£80.00"));
  check("each person's half is £40", (await text(p, "#homeCards")).match(/Isak £40\.00 share Lucas £40\.00/));

  // Custom split: typing Isak's part fills Lucas's
  await p.click("#addBtn");
  await p.fill("#txAmount", "60");
  await p.click('[data-seg="split"] [data-val="custom"]');
  await p.fill("#shareP1", "45");
  check("custom split fills the other share", (await p.inputValue("#shareP2")) === "15.00");
  check("split preview shows 75/25", (await text(p, "#splitPreview")).includes("75% / 25%"));
  await p.selectOption("#txCategory", { label: "Petrol" });
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  // One person only
  await addExpense(p, "10", "Lucas lunch", { category: "Eating out", split: "p2" });
  const shares = await p.evaluate(() => state.transactions.map((t) => shares(t)));
  check("shares stored correctly", JSON.stringify(shares) === JSON.stringify([[4000, 4000], [4500, 1500], [0, 1000]]), JSON.stringify(shares));
  check("week totals per person", (await text(p, "#homeCards")).match(/Isak £85\.00 share Lucas £65\.00/));

  // Odd pennies never go missing
  const odd = await p.evaluate(() => shares({ amount: 1001, split: { mode: "equal" } }));
  check("£10.01 splits £5.01 / £5.00", odd[0] + odd[1] === 1001);

  // Money paid in
  await p.click("#addBtn");
  await p.fill("#txAmount", "500");
  await p.click('[data-seg="kind"] [data-val="income"]');
  await p.click('[data-seg="from"] [data-val="p2"]');
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  await p.click('#modeSeg [data-mode="month"]');
  const monthCards = await text(p, "#homeCards");
  check("month view shows paid in by Lucas", monthCards.includes("Paid into the joint account") && monthCards.includes("£500.00"));
  check("Lucas is over his share", /Over £435\.00/.test(monthCards), monthCards.slice(0, 200));

  // ---------- Bills ----------
  await tab(p, "bills");
  await p.click("#addBtn");
  await p.fill("#bName", "Rent");
  await p.fill("#bAmount", "950");
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  check("bill listed", (await text(p, "#billsBox")).includes("Rent"));
  await p.click("[data-pay]");
  check("pay sheet prefilled", (await p.inputValue("#txAmount")) === "950.00");
  await p.fill("#txAmount", "955");
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  const bills = await text(p, "#billsBox");
  check("bill marked paid with changed amount", bills.includes("£955.00 of £955.00 paid"), bills.slice(0, 120));
  await tab(p, "home");
  check("home month shows bills 1 of 1 paid", (await text(p, "#homeCards")).includes("1 of 1 paid"));

  // ---------- Vouchers ----------
  await tab(p, "vouchers");
  await p.click("#voucherBox [data-action=addvoucher]");
  await p.fill("#vValue", "100"); await p.fill("#vCost", "95");
  check("voucher saving preview", (await text(p, "#vSaved")).includes("£5.00"));
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  check("voucher balance £100, saved £5", /£100\.00 Saved £5\.00/.test(await text(p, "#voucherBox")));
  // Log shop by total: £108 => voucher £100, over £8
  await p.click("#voucherBox [data-action=logshop]");
  await p.fill("#shopAmount", "108");
  check("log shop works out £8 over", (await text(p, "#shopOver")) === "£8.00");
  await p.fill("#shopNote", "Tesco");
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  check("voucher used up", (await text(p, "#voucherBox")).startsWith("Voucher balance £0.00"));
  check("history shows £8 over", (await text(p, "#voucherBox")).includes("£8.00 over"));
  // Overspend-only mode
  await p.click("#voucherBox [data-action=addvoucher]");
  await p.fill("#vValue", "50"); await p.fill("#vCost", "47.50");
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  await p.click("#voucherBox [data-action=logshop]");
  await p.click('[data-seg="how"] [data-val="over"]');
  await p.fill("#shopAmount", "8");
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  const last = await p.evaluate(() => state.transactions.at(-1));
  check("overspend-only records £58 shop, £50 voucher", last.amount === 5800 && last.voucher === 5000);
  await tab(p, "home");
  await p.click('#modeSeg [data-mode="week"]');
  check("home shows overspend on voucher shops", (await text(p, "#homeCards")).includes("£16.00 over on voucher shops"));

  // ---------- Edit + delete ----------
  await tab(p, "activity");
  const lunch = await p.evaluate(() => state.transactions.find((t) => t.note === "Lucas lunch").id);
  await p.click(`[data-edit="${lunch}"]`);
  await p.click('[data-seg="split"] [data-val="equal"]');
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  check("edit changes split", (await p.evaluate((id) => shares(state.transactions.find((t) => t.id === id)), lunch)).join() === "500,500");
  await p.click(`[data-edit="${lunch}"]`);
  await p.click("[data-sheet=delete]"); await sheetClosed(p);
  check("delete removes it", !(await p.evaluate((id) => state.transactions.some((t) => t.id === id), lunch)));
  check("activity shows split labels", (await text(p, "#txList")).includes("Split 75/25"));

  // ---------- Settings: names, categories ----------
  await tab(p, "settings");
  await p.fill("#nameP2", "Luke");
  await p.press("#nameP2", "Enter");
  await tab(p, "home");
  check("renamed person shows on Home", (await text(p, "#homeCards")).includes("Luke"));
  await tab(p, "settings");
  await p.click("[data-action=addcat]");
  await p.fill("#catName", "Coffee");
  await p.click("[data-sheet=confirm]"); await sheetClosed(p);
  check("category added", (await text(p, "#catList")).includes("Coffee"));

  // ---------- Persistence ----------
  const n = await p.evaluate(() => state.transactions.length);
  await p.reload();
  check("data survives reload", (await p.evaluate(() => state.transactions.length)) === n);

  // ---------- Week navigation ----------
  await tab(p, "home");
  await p.click("#prevPeriod");
  check("previous week label", (await text(p, "#periodLabel")) === "Last week");
  await p.click("#thisPeriod");
  check("back to this week", (await text(p, "#periodLabel")) === "This week");

  // ---------- Layout and accessibility ----------
  for (const t of ["home", "activity", "bills", "vouchers", "settings"]) {
    await tab(p, t);
    const r = await p.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      small: [...document.querySelectorAll("button, .row")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 32 && !e.closest(".row button")).length,
    }));
    check(`${t}: no sideways scroll, tap targets ok`, r.sw <= 390 && r.small === 0, JSON.stringify(r));
  }
  await p.evaluate(() => { document.documentElement.style.fontSize = "28px"; });
  for (const t of ["home", "bills", "vouchers"]) {
    await tab(p, t);
    check(`${t}: survives very large text`, (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  }
  await p.evaluate(() => { document.documentElement.style.fontSize = ""; });

  // Screenshots for a human to look at
  const shots = process.env.SHOTS;
  if (shots) {
    for (const t of ["home", "activity", "bills", "vouchers"]) { await tab(p, t); await p.waitForTimeout(150); await p.screenshot({ path: `${shots}/jf-${t}.png` }); }
    await tab(p, "home"); await p.click('#modeSeg [data-mode="month"]'); await p.screenshot({ path: `${shots}/jf-home-month.png`, fullPage: true });
    await p.click('#modeSeg [data-mode="week"]');
    await p.click("#addBtn"); await p.fill("#txAmount", "80"); await p.click('[data-seg="split"] [data-val="custom"]'); await p.fill("#shareP1", "50");
    await p.waitForTimeout(400); await p.screenshot({ path: `${shots}/jf-sheet.png` });
    await p.click("[data-sheet=cancel]"); await sheetClosed(p);
    await p.emulateMedia({ colorScheme: "dark" }); await tab(p, "vouchers"); await p.screenshot({ path: `${shots}/jf-dark.png` });
  }

  // ---------- Opens with no internet (service worker) ----------
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.context().setOffline(true);
  await p.reload();
  check("opens offline", (await p.title()) === "Joint Finance Tracker" && (await p.evaluate(() => state.transactions.length)) === n);
  await p.context().setOffline(false);

  check("no page errors", p.errs.length === 0, p.errs.join(" | "));
  await browser.close();
  server.close();
  console.log(failed() ? `${failed()} FAILED` : "ALL PASSED");
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
