# Joint Finance Tracker

Tracks joint finances for two people: weekly everyday spending (food shopping, petrol and so on), monthly joint bills, what each person paid into the joint account, and a shared food-voucher card. It is a single HTML file, `index.html`, that installs on an iPhone home screen. There is no account, and your data stays on your phones.

(This app used to be called Pocket Ledger. Data from Pocket Ledger is converted automatically the first time you open the new version, and the old copy is kept as a safety net.)

## Using it

**On a phone:** open **https://iakouari.github.io/joint-finance/** in Safari, then tap Share → Add to Home Screen. Always open it from the icon: on iPhone, data for websites you only visit in a Safari tab can be deleted after 7 days without a visit, but home-screen apps are exempt.

**On a computer:** download `index.html` and open it in your browser.

## Features

- **Joint or one person, per expense.** Each expense is split **50/50** by default. Choose **Custom** to type one person's part (the other fills itself in, so the two always add up), or give the whole amount to one person. For example, £80 → Isak £40 · Lucas £40.
- **Week and Month views.** The week view shows everyday spending (Monday to Sunday) and each person's share. The month view adds bills, and compares what each of you **paid into the joint account** with your **share of spending**: "Short £120" or "Over £45".
- **Bills.** Monthly bills (rent, energy…) with a due day and a split. Tap **Pay** to record a bill as paid; the amount can be changed if it varies. Overdue bills are flagged.
- **Vouchers.** One shared voucher card. Record vouchers you buy (e.g. £100 for £95) to track the balance and the money saved. **Log Shop** records a shop in a few taps: type the receipt total and the voucher pays what it can, with the rest recorded as **overspend** from the joint account. Or type just the overspend ("£8 over") and the app assumes the voucher was used up.
- **Sharing between both phones.** End-to-end encrypted (see below). Entries show who added them.
- **iPhone design** that follows Apple's Human Interface Guidelines: floating glass tab bar, large titles, inset grouped lists, sheets, Dark Mode, large text sizes, and 44-point tap targets.
- **Backup, restore and erase**, from Settings.

## Where your data lives, and who can see it

| Question | Answer |
|---|---|
| Where is it stored? | In each phone's browser storage (**localStorage**), under the key `jointFinance.v2`, as JSON text. |
| Does it go to a server? | **Only if you turn on Sharing, and then only encrypted.** Otherwise there is no server. The page's *Content Security Policy* (a `<meta>` tag at the top of the file) makes the browser block every network request except to the one sync server. |
| Who can see it? | Anyone who can use the phone's browser, and browser extensions you've allowed to read pages. It isn't encrypted on the phone, so keep a passcode on. |
| How could I lose it? | Clearing Safari's website data, removing the home-screen icon, or switching phone. Download a backup now and then. |

## Sharing between two phones (end-to-end encrypted)

- **Start sharing** in Settings on one phone. You get an **invite code** (`jf-…`) made of a random ledger ID and a random 128-bit secret. Send it privately, for example in Messages.
- **Join** on the other phone, then paste the code. That phone's own data is replaced by the shared tracker.
- **What leaves the phone:** every entry, bill, voucher, category and setting is encrypted on the phone with AES-256-GCM, using a key derived from the secret (HKDF), before it is sent. The secret never leaves your phones.
- **What the server can see:** the random ledger ID, random record IDs, when records changed, and that something was deleted. It can't see amounts, dates, notes, names or categories.
- **Conflicts:** if you both change the same entry, the most recent change wins on both phones.
- **Anyone with the invite code** can read and change the shared tracker, so treat it like a password.

**Server setup (one time):** create a free Supabase project and run [`sync/supabase-setup.sql`](sync/supabase-setup.sql) in its SQL Editor. Then the project's address and public key go into `SYNC_URL` / `SYNC_API_KEY` and the `connect-src` rule at the top of `index.html`. The table can't be read directly: the only way in is two functions, and both need a ledger ID.

## Key decisions, in plain language

1. **One file, no libraries.** The charts are drawn by hand as SVG. No outside code runs alongside your money data, and the strict network policy can stay switched on.
2. **Money is stored in pence as whole numbers.** In JavaScript, `0.1 + 0.2` gives `0.30000000000000004`. Whole pence (`1250` for £12.50) add up exactly.
3. **Splits never lose a penny.** A share is worked out for person 1, and person 2 gets `amount − share`, so £10.01 becomes £5.01 + £5.00, never £5.00 + £5.00.
4. **Dates are stored as text, `"2026-10-26"`.** That avoids time-zone bugs where a late-night entry moves into the next day.
5. **One source of truth.** An entry stores its category, and the category says whether it's everyday, a bill or money paid in. A bill counts as "paid" because an expense is linked to it, not because of a separate tick that could disagree. The voucher balance is *worked out* from vouchers bought minus voucher spending, rather than stored.
6. **Calculations are separate from the display code.** Functions like `shares()`, `periodTotals()` and `voucherSummary()` take data and return numbers without touching the page, which makes them easy to test.
7. **User text is escaped before display**, so a note like `<img onerror=...>` shows as text instead of running as code (an XSS bug).
8. **Data upgrades are careful.** The data carries a version number. Pocket Ledger (version 1) data is converted, and the original is left in place. Data that can't be read is copied aside, never overwritten.

## Tests

- `node tests/app.test.js` drives the app on a simulated iPhone: splits, money paid in, bills, vouchers, Log Shop, editing, renaming, upgrading old data, layout at very large text sizes, and tap-target sizes.
- `node tests/sync.test.js` runs two simulated phones sharing one tracker through a stand-in for Supabase backed by a real Postgres. It checks adds, edits, deletes, conflicts, an outage, a wrong invite code, and that the server never holds readable data. It needs Postgres with `sync/supabase-setup.sql` applied, and `PGHOST` / `PGPORT` / `PGUSER` set.
