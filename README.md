# Pocket Ledger

A personal finance tracker that is one HTML file: `index.html`. No install, no server, no account.

**On a computer:** download `index.html` and open it in your browser (double-click it). To try the importer,
use the fake Monzo export in `samples/monzo-sample.csv`.

**On a phone:** open **https://iakouari.github.io/pocket-ledger/** and add it to your home screen. In Safari, tap Share → Add to Home Screen. In Chrome on Android, tap ⋮ → Add to Home screen.
Always open it from the home-screen icon. On iPhone, data for websites you only visit in a Safari tab can be deleted after 7 days without a visit, but home-screen apps are exempt.
Your phone and your computer each keep their own separate data. Move it between them with *Download backup* and *Restore from backup*.

> The web address serves only the empty app (the code you can read in this repo). Your transactions are saved in your phone's browser and are never sent to GitHub or anywhere else. The page's security policy blocks every outgoing network request, including requests to the site that hosts it.

## Features

- Add, edit and delete transactions (amount, date, category, note).
- Your own categories. Each one has a type (Spending, Income or Savings), and the type decides how its transactions are counted.
- A dashboard for any month: money in, money out, net, and how much you saved compared with a monthly goal.
- Charts: spending by category, and money in and out for the last six months. Hover over a bar, or tab to it, to see the numbers.
- CSV import. A Monzo export is recognised and its columns are matched automatically. For other banks you pick which column is which. Re-importing the same file never creates duplicates.
- Backup to a JSON file, restore from a backup, and erase everything.

## Where your data lives, and who can see it

| Question | Answer |
|---|---|
| Where is it stored? | In your browser's **localStorage**, a small key-value store (roughly 5 MB) that the browser saves on your computer's disk. The data sits under one key, `pocketLedger.v1`, as JSON text. |
| Does it go to a server? | **No.** There is no server. The page also has a *Content Security Policy*, a `<meta>` tag at the top of the file that tells the browser to block every network request the page makes. So the browser itself enforces "nothing leaves the device", not just my promise. You can check this: the test that tried `fetch("https://example.com")` was blocked. |
| Who can see it? | Anyone who can use your browser profile on your computer, and browser extensions you've allowed to read pages. The data is **not encrypted**, so protect it the same way you protect your computer: with a login password and disk encryption (FileVault or BitLocker). |
| What about the CSV? | The browser reads the file locally (`file.text()`). Nothing is uploaded. The app keeps only the fields it needs: date, amount, category, name, notes and the Monzo transaction ID. |
| How could I lose it? | Clearing "site data" or "cookies and site data", using a private window, or switching browser or computer. Each browser keeps its own separate storage. Use **Your data → Download backup** now and then. |
| Opening the file locally vs hosting it | Storage is tied to the page's *origin* (where it was loaded from). If you open the file from disk (`file://`) and later from a website, they have separate storage. In Chrome, every local `file://` page shares one storage area, so another local HTML file could read this data. Only open local files you trust. |

## Key decisions, in plain language

1. **One file, no libraries.** The charts are drawn by hand as SVG instead of using a charting library from the internet. That keeps the app working offline. It also means no outside code runs alongside your bank data, and the strict "block all network" policy can stay switched on.

2. **Money is stored in pence as whole numbers.** Computers store decimals in binary, and binary can't hold most decimals exactly: in JavaScript, `0.1 + 0.2` gives `0.30000000000000004`. Adding thousands of transactions as pounds would slowly build up errors like that. Whole pence (`1250` for £12.50) add up exactly. The app converts to pounds only for display.

3. **Dates are stored as text, `"2026-10-26"`.** A full date-and-time object brings in time zones. A transaction late at night on the 31st can show up in the next month once it's converted to UTC. Plain date text sorts correctly and doesn't change between time zones.

4. **The category decides the type.** A transaction doesn't store whether it is income or spending. It stores its category, and the category has the type. Each fact is stored once (a "single source of truth"), so the two can never disagree. If you change a category's type, all its transactions follow.

5. **Calculations are kept separate from the display code.** Functions like `monthTotals()` take data and return numbers without touching the page. Code like that is easier to reason about and to test.

6. **User text is escaped before display.** Notes come from you, or from a CSV file. If a note contained `<img onerror=...>` and the app put it into the page as raw HTML, the browser would run it. This kind of bug is called cross-site scripting (XSS). The `esc()` function and the use of `textContent` turn such text into harmless characters. The test adds exactly that note and checks that it shows up as plain text.

7. **Saving is careful.** The data carries a version number, so a future version of the app can upgrade old data. If saved data can't be read, the app copies it to a separate key instead of overwriting it. If storage is blocked or full, a visible warning appears instead of the app silently losing your entries.

8. **Imports are previewed and checked for duplicates.** Every Monzo row has a unique Transaction ID. The app remembers each imported ID, so importing an overlapping export only adds the new rows. You see a summary (counts, date range, any new categories) before anything is saved.

## How Monzo rows are interpreted

Monzo amounts are from the account's point of view (`-12.50` means money left the account):

| Monzo row | Becomes |
|---|---|
| Type `Pot transfer`, money into a pot | **Savings** (taking money out of a pot counts as negative savings) |
| Positive amount in category `income`, `transfers` or blank | **Income** ("Other income") |
| Positive amount in a spending category | A **refund**, which reduces spending in that category |
| Negative amount | **Spending** in a category named after Monzo's (`eating_out` → "Eating out"). The category is created if it doesn't exist. |
| £0.00 (card checks) | Skipped |

Monzo files rent under **Bills**. Add a "Rent" category and recategorise the transaction if you want it shown separately.

## Ideas for next steps

- Split `index.html` into separate HTML, CSS and JS files, and add automated tests for the calculation functions.
- Optional encryption of the stored data with a passphrase, using the browser's built-in Web Crypto API.
- Budgets per category.
