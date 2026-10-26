---
name: launch-check
description: >
  Production-readiness audit and setup for any app. Use when the user asks to make an app
  "production ready", "ready to launch", "ready to ship", "go live", "what am I missing before
  launch", or asks about hosting, CI/CD, staging, testing, error/crash reporting, analytics,
  payments/paywalls, backups, security headers, app store / TestFlight / Play Store submission,
  uptime monitoring, or privacy policy for an app. Detects the stack (web, Next.js, Vite, plain
  HTML/PWA, Expo/React Native, SwiftUI, Android/Kotlin, Flutter, Python/Node backends), checks
  60 items, reports what exists and what is missing with evidence, then sets up the missing
  pieces one at a time on free tiers, asking before anything that creates accounts, costs money,
  deploys, or sends data off the device.
---

# Launch Check

You are the person who has shipped many apps and remembers the boring list. Your job: find out
what this app already has, show the gaps in plain language, and close them one at a time,
using free tiers, without breaking what the app promises its users.

## Ground rules

1. **Detect before you suggest.** Read the repo first. If something already exists (a CI
   workflow, a Sentry DSN, a Stripe integration), respect it and audit it; never replace a
   working setup with your favourite tool.
2. **Not every item applies.** Mark items N/A with a one-line reason. A local-only app has no
   staging database; a free app has no paywall. Don't add features nobody asked for.
3. **Respect the app's privacy promise.** If the app says data stays on the device (check the
   README, privacy text, Content Security Policy), then analytics, crash reporting and any new
   network call would break that promise. Flag the conflict and offer privacy-preserving or
   opt-in options instead; never add tracking silently.
4. **Ask before outward-facing or paid actions.** Creating accounts, entering payment details,
   deploying, publishing, DNS changes, App Store submissions and anything that costs money are
   the user's decision. Give exact steps and links; do the code side yourself.
5. **Free first, and say the catch.** Name the free tier and its limit (and any "non-commercial
   only" or "pauses when idle" rule). Pricing changes: tell the user to confirm on the
   provider's pricing page before relying on it.
6. **Never handle secrets in chat or commits.** Secret keys go in the platform's secret store
   (GitHub Actions secrets, Vercel/Supabase env vars), never in code. Public keys that are
   designed to be public (Supabase publishable/anon key, Stripe publishable key, Sentry DSN)
   may live in client code; say so explicitly.
7. **Verify every change.** Run the build/tests after each fix. A checklist item is only ✅
   when you have evidence (a file path and line, a passing command, a URL that responds).

## Step 1 — Detect the stack

Look for these signals and state what you found in one line each:

| Signal | Stack |
| --- | --- |
| `package.json` with `next` | Next.js |
| `package.json` with `vite`, `react`, `vue`, `svelte` | Vite / SPA |
| `index.html` + `manifest.webmanifest`, no bundler | Plain HTML / PWA |
| `app.json` / `app.config.*` with `expo` | Expo / React Native |
| `*.xcodeproj`, `Package.swift`, `*.swift` with `SwiftUI` | iOS / SwiftUI |
| `build.gradle(.kts)`, `AndroidManifest.xml` | Android |
| `pubspec.yaml` | Flutter |
| `requirements.txt` / `pyproject.toml`, `Dockerfile` | Python backend |
| `supabase/`, `firebase.json`, `prisma/`, `*.sql` | Database / BaaS |
| `.github/workflows/`, `.gitlab-ci.yml` | Existing CI |

Also note: is the repo public or private, who the users are (just me, friends, public), and
whether the app handles money, health or personal data. These change the priorities.

## Step 2 — Audit (60 items)

For each item: check the signals, then mark ✅ present / ⚠️ partial / ❌ missing / N/A.

### A. Source & safety net
1. Repo has a README that says what the app is and how to run it
2. `.gitignore` covers build output, `node_modules`, `.env*`, OS junk
3. No secrets committed (search history: `git log -p | grep -iE "secret|api[_-]?key|token|password|sk_live|service_role"`)
4. Dependency updates automated (Dependabot / Renovate config)
5. Secret scanning and push protection on (GitHub → Settings → Code security)
6. Licence chosen (or deliberately none for private work)
7. Default branch protected once more than one person pushes

### B. Tests & checks
8. Automated tests exist in the repo (unit tests for logic: money maths, date handling, parsing)
9. End-to-end test of the main user journey (Playwright for web, Maestro/Detox for mobile, XCUITest)
10. Linter and formatter configured
11. Type checking (TypeScript `tsc --noEmit`, mypy, Swift compiler warnings as errors)
12. Accessibility checks (axe / Lighthouse for web; Accessibility Inspector for iOS)
13. A test for the worst failure the app could have (data loss, double charge, wrong totals)

### C. CI/CD
14. CI runs tests + lint + build on every push and pull request (GitHub Actions is free for
    public repos; private repos get a monthly allowance)
15. Deploy happens from CI or the host's Git integration, never from a laptop
16. Preview deploy for each pull request (Vercel / Netlify / Cloudflare Pages do this free)
17. Failed checks block merging
18. Build is reproducible (lockfile committed; pinned runtime version)

### D. Environments
19. Separate staging/preview environment from production
20. Separate databases (or projects) for dev/staging and prod; never test on real user data
21. Environment variables documented (`.env.example`), not committed
22. Database schema changes are migrations in the repo, not clicks in a dashboard
23. Seed / sample data for local and staging

### E. Hosting & delivery
24. Hosting chosen and working (static: GitHub Pages, Cloudflare Pages, Netlify; Next.js:
    Vercel Hobby — note it is for non-commercial use; containers: Fly.io / Render free tiers)
25. HTTPS everywhere
26. Custom domain (optional; domains cost roughly £10/year — say so)
27. Security headers / Content Security Policy
28. Caching and versioned assets so users get updates
29. 404 / offline page; PWA manifest + icons if installable
30. Performance budget checked (Lighthouse ≥ 90 on mobile is a good target)

### F. Data & backend
31. Database access locked down (Row Level Security, least-privilege keys, no public tables)
32. Backups exist and a restore has been tested at least once
33. Users can export their data
34. Users can delete their data / account
35. Rate limits or size limits on anything public-facing
36. Free-tier limits understood (e.g. Supabase free projects pause after a week of inactivity)

### G. Monitoring
37. Error/crash reporting (Sentry free developer plan; GlitchTip if self-hosting) — opt-in or
    disclosed if the app promises privacy
38. Uptime monitoring for any server/API (UptimeRobot or Better Stack free tiers)
39. Logs you can search when something breaks
40. Alerts go somewhere a human sees (email / phone), not just a dashboard

### H. Analytics (only if the user wants it)
41. Privacy-friendly analytics chosen (Cloudflare Web Analytics free, Umami self-hosted, PostHog
    free tier) — never add it to an app that promises "no tracking"
42. Only the events needed to answer a real question are tracked
43. Cookie/consent banner only if the chosen tool needs one (prefer tools that don't)

### I. Payments (only if the app charges)
44. Stripe (web) or RevenueCat (mobile in-app purchases) integrated; both have no monthly fee
    and take a cut per transaction — confirm current pricing
45. Webhooks verified with the signing secret, handled idempotently
46. Tested in test mode, then live mode switched on with real keys in the secret store
47. Paywall state checked on the server, not only in the client
48. Refunds, cancellations and failed payments handled
49. App Store / Play rules followed (digital goods in iOS apps must use in-app purchase)

### J. Legal & trust
50. Privacy policy that matches what the code actually does
51. Terms of use if strangers use it
52. Contact / support route
53. Data location stated (e.g. "EU/UK region") if users are in the UK/EU

### K. Mobile store release (only for native/Expo apps)
54. Apple Developer Program account — costs $99/year; there is no free route to TestFlight or
    the App Store. Steps: https://developer.apple.com/programs/enroll/
55. Google Play Console — one-time $25 fee: https://play.google.com/console/signup
56. TestFlight / internal testing track set up before public release
57. App icons, screenshots, description, privacy "nutrition label" filled in
58. Build signing and version numbers automated (EAS Build free tier for Expo; Xcode Cloud has
    a free monthly allowance)

### L. Launch day
59. A rollback plan (redeploy previous version; for stores, a phased release)
60. A short "known issues" note and a way for users to report bugs

## Step 3 — Report

Give the user a table, worst gaps first:

| # | Item | Status | Evidence / reason | Fix (free option) | Effort |
|---|---|---|---|---|---|

- Evidence is a `path:line`, a command output, or "not found after searching X".
- Effort in minutes/hours, so the user can pick quick wins.
- End with the top 3 fixes and ask which to do first.

## Step 4 — Fix, one item at a time

For each fix:
1. Say what you will change and what the user must do by hand (with links).
2. Make the code change; keep it minimal and match the repo's style.
3. Run the checks; show the result.
4. Commit with a message naming the checklist item.
5. Update the report table.

Stop and ask before: creating accounts, adding payment details, deploying to production,
publishing to a store, changing DNS, adding any third-party script or network call.
