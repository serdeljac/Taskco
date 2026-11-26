# Slice 8a — ready to leave this machine

Specified 2026-11-21, from design section 17 and [`step-8-prep.md`](./step-8-prep.md). The first
slice of step 8, in [`learning-path.md`](./learning-path.md). It goes on branch `step-8a`, made from
`main`. Everything in it is code, built and tested on this machine. No server, no Docker image and
no migration yet: those are 8b and 8c.

**Tried on 2026-11-21**, in a throwaway copy of `main` outside the repo, deleted afterwards with the
copy of `.env.test` it needed:

- the security updates, with both suites and `web/`'s build;
- a five-per-hour account limit, against the existing tests;
- the cookie renamed;
- the seed importing the test guard, and what the build then contains.

The preparation's rehearsal, in containers, covers the rest. The traps are at the end.

---

## What it must do

Everything section 17 decided must change in the code before Taskco is reachable by anyone:

- the ten changes;
- a password that may not be the email;
- the login limit and the account limit;
- the purge on a timer.

When 8a is done, the API runs compiled, without `tsx`. It serves the built frontend itself, reads
its address and settings from the environment, survives a database restart, stops cleanly, and
refuses guessing.

## Done looks like

- **The whole app from one command.** Build `web/`, then run `npm run build` and `npm start`, with
  `WEB_DIST` pointing at `web/dist`. Taskco works at `http://127.0.0.1:3000`, with no Vite: log in,
  open a project, and reload `/projects/7` without losing the page.
- **`GET /api/health`** answers `{"ok":true}` without logging in.
- **Restarting the database under the running API** logs one line, and the next request works.
- **`npm run seed` refuses** any database whose name does not end in `_dev`, and says so.
- **Eight wrong passwords** in a row make the login page say "Too many attempts. Try again in 15
  minutes." — and the right password is refused too, until the fifteen minutes pass.
- **A sixth new account from one visitor within an hour** is refused, in the register page's own
  words.
- **Registering with the email as the password** is refused before anything is sent, and by the
  server if it is sent anyway.
- **The login cookie is `__Host-taskco_session`**, and logging in through Vite still works.
- **`npm audit` finds nothing**, at the root and in `web/`.
- Both test suites pass, in file order and shuffled. Both type checks are clean, and both builds.

## Already decided

All in design section 17, by name:

- `before-it-is-reachable`: its ten changes, the password rule, the two login counts, the account
  limit, and hand-written limits;
- `who-serves-the-frontend`;
- `the-image`, for the build config and the scripts;
- `purge-schedule`.

## Choices made while specifying, for Stjepan's review

1. **The health check lives in `app.ts`, above "who is asking"**, not on the outer server as
   section 17's table says. The path is the same, `/api/health`, and the existing Supertest setup
   tests it with no new harness.
2. **The outer server moves into `src/site.ts`**, a function that builds it: the `/api` mount,
   `trust proxy`, the built frontend, and the JSON 404. `server.ts` keeps only what touches the
   process: reading settings, listening, stopping, the timer. Today nothing tests the outer server,
   because `server.ts` starts listening the moment it is imported. A function can be tested.
3. **`purgeAll()` joins `queries.ts`.** It runs the projects, then the accounts, then the sessions —
   the order `purgeDeletedAccounts` depends on — written once. `npm run purge` and the timer both
   call it.
4. **Security fixes are taken at their newest patch**, the day they are found, not after the three
   weeks step 7 waited before adding a package.
   - At the root, `npm audit fix` changes only the lock file: `zod` 4.6.7, `body-parser` 2.4.0, `qs`
     6.17.1. It also brings the dev tools up to date, `vitest` 5.1.1 and the `vite` under it, whose
     versions were also flagged.
   - In `web/`, `vite` 8.3.8, pinned exactly as `web/` pins everything.
   - `vite` 8.3.8 is ten days old, and `vitest` 5.1.1 three.
5. **The limits are one small module, `src/limits.ts`.** Each count is a `Map`, and the clock is
   passed in, so its tests fix the time, as `streak.test.ts` does. Every count is cleared before
   every test, in `src/testing/setup.ts`.
6. **A successful login clears only the visitor-and-email count.** The email-alone count goes on,
   so the owner logging in does not wipe a wider attack's progress.
7. **The account limit counts every registration that passes the body check**, created or refused
   as "email taken". Counting only successes would let anyone ask, five hundred times, which
   emails have accounts.
8. **The login lock is checked before the password is hashed.** A locked login answers 429 without
   spending 40 ms. An email with no account is counted and locked the same way, so the lock reveals
   nothing about who has an account.
9. **The password rule is a refusal in `registerUser`**, before hashing:
   `Refused("password-is-email")`, which answers 409. A future "change password" calls the same
   check. Both sides are lowered before comparing; nothing is trimmed, since passwords never are.
10. **The words:**
    - `too-many-attempts` on the login page: "Too many attempts. Try again in 15 minutes."
    - `too-many-attempts` on the register page: "Too many new accounts from here. Try again in an
      hour."
    - `password-is-email`: "Your password can't be your email."
11. **The test guard moves first, in a commit of its own**, from `src/testing/guard.ts` to
    `src/guard.ts`. The seed needs it, and `src/testing` must stay out of the build — the third trap
    below.
12. **`engines` becomes Node 24.15 or later** in both `package.json` files, since a `web/` test
    dependency asks for it. This machine runs 24.22.3.

## Concepts involved

- **Settings from the environment**, with defaults, rather than fixed in the file.
- **A process's signals:** `SIGTERM`, and what "stop cleanly" means for a server and its pool.
- **An event with no listener ends the process**, as the pool's `error` did in the rehearsal.
- **Serving files, and a fallback** for addresses that are pages, not files.
- **State that lives in memory**, and why tests must clear it.
- **A clock passed in**, so time can be fixed in a test.
- **HTTP 429 and `Retry-After`.**
- **A config that extends another**, `tsconfig.build.json`.
- **A security fix through the lock file alone.**
- **A timer that does not keep the process alive**, and an error inside it that must not end it.

## Who types it

Stjepan types every piece, from code Claude gives with its exact place, tried first in a throwaway
copy (the rule since 2026-11-08). New tools get numbered steps with the exact text to type: P1's
`npm audit fix`, P2's `git mv`, P9's build config and scripts. Claude writes the docs, in P14.

---

## The pieces, in order

Each ends in a test seen failing first, or in a check that can be watched.

### Housekeeping

**P1 — the security fixes.**
- At the root, `npm audit fix`: the lock file only.
- In `web/`, `vite` 8.3.8, saved exactly.
- `engines` to `>=24.15.0` in both.

Check: `npm audit` finds nothing in either, both suites pass, and `web/` builds. Closes
`dependency-advisories`.

**P2 — the guard moves.** `src/testing/guard.ts` becomes `src/guard.ts`, with `git mv`, and its two
importers follow: `src/testing/env.ts` and `src/test_queries/guard.test.ts`. A move and nothing
else, so the suite is unchanged at 464.

**P3 — the seed refuses any database but a dev one.** `isDevDatabase(url)` beside
`isTestDatabase`, with tests:
- `taskco_dev` passes;
- `taskco_test` and `taskco` are refused;
- so is a name with `_dev` only in its query string.

`seed.ts` stops before truncating anything: "Refusing to seed: DATABASE_URL must name a database
ending in _dev". Closes `seed-has-no-guard`.

**P4 — the cookie becomes `__Host-taskco_session`.** One commit for the constant in `app.ts`, the
test helper in `src/testing/session.ts`, and the six places in `sessions.test.ts` that name it. The
suite is unchanged. Then log in through Vite, in a browser. Closes
`session-cookie-has-no-host-prefix`.

### Registering

**P5 — a password may not be the email.** Test first, at three levels:
- `1_users.test.ts`: `registerUser` refuses, and no account exists afterwards.
- `sessions.test.ts`: `POST /users` answers 409 `password-is-email`, and sets no cookie.
- `web/`: the register page refuses before sending, in its own words, and sends nothing.

`RefusalCode` gains `password-is-email`, and `api/words.ts` gains its words.

### The server's shape

**P6 — the health check.** `GET /health` in `app.ts`, in the section anyone may use, above "who is
asking": `select 1`, then 200 `{ ok: true }`. Its test asks with no cookie. Closes `no-health-check`.

**P7 — the outer server becomes `site.ts`.** `site({ webDist, trustProxy })` builds what
`server.ts` builds today, plus:
- `trust proxy`, when one is given;
- with `webDist`: the files in it, then `index.html` for a `GET` whose last part has no file
  extension;
- everything else, a JSON 404, as now.

Tests, in a new `src/test_http/site.test.ts`, against a tiny folder of fixtures, never against
`web/dist`, which may not be built:
- `/projects/7` is the page;
- `/assets/app.js` is the file;
- `/assets/missing.js` is a 404;
- `/api/health` still reaches the API;
- with no `webDist`, `/projects/7` is a 404.

**P8 — `server.ts` reads its settings, and stops cleanly.**
- `HOST`, `PORT`, `TRUST_PROXY` and `WEB_DIST` come from the environment. The defaults are
  `127.0.0.1`, `3000`, off and none, so `npm run dev` is unchanged.
- A listener on the pool's `error` logs the error and carries on.
- On `SIGTERM`, it closes the server, ends the pool and exits 0.

Checked by hand: `npm run dev` works as before, and `docker restart taskco-db-1` under it logs one
line, and the next request answers. `SIGTERM` is proven in 8b's container (the fifth trap). Closes
`server-listens-on-localhost-only` and `server-dies-when-the-database-goes`; with 8b,
`no-shutdown-on-sigterm`.

**P9 — build and start.**
- `tsconfig.build.json` extends `tsconfig.json`, and leaves out `src/**/*.test.ts` and
  `src/testing`.
- `"build": "tsc -p tsconfig.build.json"` and `"start": "node dist/server.js"` join the scripts.

Check:
1. `npm run build` emits no test files.
2. Build `web/`.
3. Run `npm start` with `WEB_DIST` set.
4. The first point of "Done looks like" holds.

Closes `no-production-start` and `nothing-serves-the-built-frontend`, for this machine; 8b puts them
in an image.

**P10 — the purge, on a timer.** First `purgeAll()`, test first: one run removes a project past its
date, then its Lead's account past its date, then an expired session, and returns the three
counts. `purge.ts` calls it. Then `server.ts` runs it at start and every twenty-four hours:
- it logs the counts;
- it catches and logs any error, rather than ending the process;
- its timer is `unref()`ed, so it never keeps the process alive.

Closes `purge-runs-only-by-hand` once it runs hosted.

### The limits

**P11 — the limits module.** `src/limits.ts`: a count kept per key, with a window and a lock,
reading the time from a clock it is given. Tests with a fixed clock, as `streak.test.ts` has:
- eight failures lock the key, and the ninth is refused;
- the lock lasts fifteen minutes, then the key starts from zero;
- clearing a key resets it;
- one key's failures do not touch another's;
- fifty for the email alone within an hour, then fifteen minutes.

Plus the five-per-hour count for new accounts. `src/testing/setup.ts` clears every count before
every test.

**P12 — the login limit.** `POST /sessions` asks both counts before `logIn`.
- Refused: 429, `too-many-attempts`, with `Retry-After` in seconds.
- A failure adds to both counts. A success clears the visitor-and-email count.
- The login page shows the words, and its test shows them.

HTTP tests:
- eight wrong passwords, then the right one: 429, and no cookie;
- an email with no account is locked the same way;
- a success after seven failures clears them.

The fifty-per-email count is tested on the module, not over HTTP: Supertest is always the same
visitor, and fifty hashes are two seconds. Closes `login-not-rate-limited`.

**P13 — the account limit.** `POST /users` asks the count after the body check, and adds to it
before `registerUser`. The sixth within the hour is 429. The register page shows its words. Tests
in `sessions.test.ts` and in `web/`.

### And the rest

**P14 — the docs**, Claude's:
- the reference's step 8a section;
- the open items closed, and any opened;
- the learning path's progress log;
- design section 17, for the choices above.

Then the flows in "Done looks like" are checked in a browser, and 8a is merged into `main`.

## Pace

An estimate as a stuck-detector, not a deadline: **10 to 14 hours**, most of it in P7, P11 and P12.

---

## Traps

All run on 2026-11-21, except those marked.

- **Counts outlive a test.** A five-per-hour account limit added to the throwaway passed the
  existing tests: `sessions.test.ts` makes exactly five accounts that pass the body check. The
  limit's own test, making six, then left the count full. The next test's registration came back
  `expected 429 to be 201`. Clearing every count before each test, in `setup.ts`, made both pass,
  in order and shuffled with `sessions.test.ts`. P11.
- **Renaming the cookie in `app.ts` alone fails 171 tests.** The test helper still sent
  `taskco_session`, so every test that logs in got "Log in first". With the helper and
  `sessions.test.ts` renamed too, all 466 passed: 464, and the two trial tests. P4 is one commit.
- **`exclude` does not keep out a file something imports.** With `seed.ts` importing
  `./testing/guard.js`, `tsc -p tsconfig.build.json` emitted `dist/testing/guard.js`, though the
  build config leaves `src/testing` out. That is why P2 moves the guard first.
- **The security updates change nothing that is tested.** After `npm audit fix`, all 464 passed. In
  `web/`, with `vite` 8.3.8, all 207 passed and the build was clean. On Node 24.22.3, `npm ci` in
  `web/` no longer warns `EBADENGINE`.
- **Windows cannot send the `SIGTERM` a container stop sends.** *Reasoned:* `Ctrl+C` is `SIGINT`,
  and Windows has no `kill -TERM`. So P8's handler is written and read here, and watched working in
  8b, where `docker stop` sends it. The rehearsal ran it: 0.47 seconds, exit 0.
- **A promise rejected inside a timer ends the process.** *Reasoned:* Node's default for an
  unhandled rejection is to stop, so a purge that fails at 3 a.m. — the database restarting, say —
  would take the server with it. P10 catches it.
- **A timer keeps the process alive.** *Reasoned:* an interval with no `unref()` holds the process
  open after the server closes. With the `SIGTERM` handler calling `process.exit(0)` it would still
  stop, but `unref()` says what is meant.
- **Supertest is always the same visitor.** *Reasoned:* `req.ip` is `::ffff:127.0.0.1` for every
  request. "Another visitor is not locked out" is tested on the module, with two keys, not over
  HTTP.
- **`127.0.0.1`, not `localhost`, for `npm start`.** *Reasoned, from the step 7 preparation:* a
  cookie set on one is not sent to the other. Open the app at the address the server prints. A
  `__Host-` cookie needs a secure origin, and browsers count both as one; the rehearsal ran
  `localhost`.
- From the preparation, still true: Express 5 refuses the route `"*"`, so the fallback is
  `"/{*splat}"` with its own check for a file extension; and without that check, a missing file is
  answered with the page.

## Open items it meets

| Item | What 8a does |
|---|---|
| `dependency-advisories` | Closed by P1 |
| `seed-has-no-guard` | Closed by P3 |
| `session-cookie-has-no-host-prefix` | Closed by P4 |
| `no-health-check` | Closed by P6 |
| `server-listens-on-localhost-only`, `server-dies-when-the-database-goes` | Closed by P8 |
| `no-shutdown-on-sigterm` | Written in P8, closed when 8b watches it work |
| `no-production-start`, `nothing-serves-the-built-frontend` | Closed for this machine by P7 and P9; 8b puts them in the image |
| `purge-runs-only-by-hand` | Built in P10; closed once it runs hosted |
| `login-not-rate-limited` | Closed by P12 |
| `registration-reveals-accounts` | Its defence, the account limit, is P13. It stays accepted |
| `pool-close-depends-on-file-isolation` | Unchanged: `setup.ts` gains a `beforeEach` line, and still closes the pool per file |
