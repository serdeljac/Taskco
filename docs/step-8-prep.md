# Step 8 — preparation

Written 2026-11-20, after step 7 was merged and `main` pushed, and before step 8 is specified.
Companion to [`design-decisions.md`](./design-decisions.md) and [`learning-path.md`](./learning-path.md),
step 8. Built the way [`step-5-prep.md`](./step-5-prep.md) and [`step-7-prep.md`](./step-7-prep.md)
were.

**This file is a dated snapshot, like the reviews.** It holds what step 8 starts from, ten questions
to answer before its first line, the order the slices would go in, and the traps waiting in them.
When a question is answered, the decision moves into `design-decisions.md`, and this file is not
edited to match. Whether something is still open is answered in [`open-items.md`](./open-items.md).

**What was run.** Every behaviour claimed here was run on 2026-11-20 unless it is marked *reasoned*:

- `main` at `9f6d1e7`, copied into a throwaway folder outside the repo, with a throwaway
  `server.ts`.
- From it, a production image, built in three stages on `node:24.14.1-trixie-slim`.
- A Compose stack of four services under its own project name, `taskco8trial`, with its own volume:
  Postgres 18.6, a one-shot migrate, the API, and Caddy 2.11.9 serving HTTPS on `localhost:8443`
  with a certificate from its own local authority. It was removed afterwards, with its volume and
  the image.
- The database pool against `taskco_test`, with the dev container restarted under it.
- A `__Host-` cookie in Chrome 156, in the Claude app's built-in browser.

Hosting prices were looked up, not tried: they come from secondary sources in November 2026, which
disagree with each other. Check each provider's own page on the day of choosing.

---

## What step 8 starts from

- **Everything passes.** 464 tests at the root against the container, in file order and shuffled;
  207 in `web/`; both type checks; `web/`'s build. The doc pass the same day is in the learning
  path's progress log.
- **The API runs only one way:** `tsx watch src/server.ts`, on `127.0.0.1:3000`, both fixed in the
  file. `tsx` is a dev dependency. Nothing serves the built frontend; everything outside `/api` is a
  JSON 404.
- **One origin is decided** (design section 16): the built frontend and the API from one address,
  with the API under `/api`. The browser's own code already asks `/api/…` relative to the page.
- **The session cookie** is `taskco_session`: `HttpOnly`, `Secure`, `SameSite=Strict`, thirty days.
  So the hosted app needs HTTPS, or nobody can log in (`secure-cookie-needs-a-secure-origin`).
- **A write from another site is refused**, by its `Sec-Fetch-Site` header, before anything else.
- **Postgres runs in a container here**, pinned to `postgres:18.6-trixie`, with `taskco_dev` and
  `taskco_test` owned by `taskco_app`, which can log in and do nothing else.
- **Nothing runs on a schedule.** `npm run purge` removes what is past its date, by hand.
- **Hosting is open** (design section 11). The learning path's purpose says real-world use is
  optional, so the host is chosen for what it teaches and what it costs, not for scale.
- **Who types it.** Stjepan types every piece, from code Claude gives by place (the rule since
  2026-11-08). Most of step 8 is tools he has never met: a Dockerfile, a Caddyfile, SSH, a firewall,
  a DNS record, cron and `pg_dump`. So, as from Docker part 1's F2 on, each comes as numbered steps
  with the exact text to type and what to expect.

---

## The ten questions

Named like open items, so they can be referred to by name. Each has a recommendation. None is
decided.

### 1. `hosting` — where Taskco runs

Three shapes, with rough prices from November 2026 — see the end of this file.

- **A rented Linux server (a VPS)**, running the same kind of Compose file as this machine:
  Postgres, the API, and Caddy in front for HTTPS. Hetzner's smallest shared server is about €5.50
  to €6 a month before VAT, plus €0.50 for an IPv4 address. Sources disagree on the price, and some
  report it out of stock in the autumn.
  - *Teaches:* all of Docker part 2. Running a Linux server: SSH keys, a firewall, updates. A proxy
    that fetches its own certificates. Cron. Backups.
  - *Costs:* every job a platform would do is Stjepan's: updating the system, the firewall, the
    backups, and a restore that works.
  - *Matches this machine:* production would run the same Postgres image as here, with the same
    487 timezone names.
- **A platform that runs a container** — Render, Railway or Fly.io. It takes the same image, builds
  it from the Dockerfile, gives HTTPS and an address, and offers a managed Postgres with backups.
  Prices: Render about $7 for the service and $6 for the smallest Postgres. Railway's Hobby plan,
  $5 with $5 of use included. Fly.io about $2 for a small machine, but $38 for its smallest managed
  Postgres.
  - *Teaches:* the image, settings from the environment, and migrations on deploy. It teaches
    nothing about Compose in production, servers, or backups.
  - *Costs:* the Postgres version, and its timezone names, are the platform's, and a scheduled job
    is a separate service on some of them.
- **Vercel, with a Postgres from its marketplace.** Express runs as functions, not as one process,
  so there is no container at all. The Hobby plan is free, and its cron runs at most once a day,
  which is enough for the purge.
  - *Teaches:* little of what step 8 was planned for: it removes Docker part 2.
  - *Costs:* *reasoned:* a database pool in every function instance, and no long-running process to
    hold a timer.

**Recommended: the VPS.** Step 8 is Docker part 2 by the learning path's own plan, and use is
optional, so the shape that teaches most wins, at about the price of the others. Production would
also match this machine more closely than on any platform.

*Accepted cost:* the server's upkeep is Stjepan's.

*Retreat clause:* if setting the server up fights back for more than an evening, Render takes the
same image with its own Postgres. Slices 8a and 8b carry over unchanged, which is one reason for
question 3's answer.

### 2. `address` — the name Taskco is reached by

Caddy fetches a certificate from Let's Encrypt for a name that points at the server. *Reasoned,
from Caddy's documentation:* it does this by itself, once a DNS record points the name at the
server and ports 80 and 443 are open.

- **A subdomain of a domain Stjepan already owns**, such as `taskco.` in front of it. That needs
  one DNS record at whoever holds the domain.
- **A new domain** — a yearly fee, and a second account to keep.
- **The platform's own address**, `….onrender.com` or similar — only on a platform.

**Recommended: a subdomain of a domain already owned**, if there is one. The cookie needs no change
for any of them: it names no domain, so it belongs to whichever address set it.

### 3. `who-serves-the-frontend` — Express, or the proxy

- **Express serves `web/dist`.** The API answers anything under `/api` first, as today. Then a file
  in `web/dist`, if one has that path. Then `index.html` for every other `GET`, so an address like
  `/projects/7` loads the app, and React Router draws the page. Caddy only does HTTPS and passes
  everything on. **Run:** with `express.static` and a catch-all `GET`:
  - `/projects/7` answered 200 with the page;
  - `/api/nowhere` still answered as the API does;
  - a write from `cross-site` was still 403.
- **Caddy serves the files itself**, and passes only `/api` on. Caddy is faster at files. But the
  built files must then reach Caddy's container: a second image, or a volume both share.

**Recommended: Express.** One image is the whole app, so it runs the same behind Caddy, on any
platform (question 1's retreat), and in a Supertest test. *Accepted cost:* Node serves files more
slowly than Caddy would. That is invisible at this size.

### 4. `the-image` — what goes in the container

**Run:** a Dockerfile in three stages built a 352 MB image.

1. **Compile the API.** `npm ci`, then `tsc` with a build config that leaves out the tests.
2. **Build `web/`.** `npm ci` there, then `vite build`.
3. **The runtime.** `npm ci --omit=dev` installs Express, `pg`, Zod and `dotenv` — 84 packages, no
   `tsx`, no TypeScript. Then the compiled `dist/`, `migrations/` and `web/dist` are copied in. It
   runs as the image's `node` user, not as root, with `node dist/server.js`.

Questions inside it:

- **Which Node.** The trial pinned `node:24.14.1-trixie-slim`, the version on this machine. `npm ci`
  in `web/` warned `EBADENGINE`, because a dependency of `jsdom` 30.1.1 asks for Node 24.15 or
  later. `node:24.15.0-trixie-slim` has been published since 2026-05-20. **Recommended:** pin
  24.15.0 in the image, and move this machine to 24.15 as well. `trixie` is the Debian release that
  the Postgres image already uses.
- **A build config.** `tsconfig.json` includes all of `src`, so `tsc` compiles the tests and
  `src/testing` too. **Run:** a `tsconfig.build.json` that extends it and leaves out
  `src/**/*.test.ts` and `src/testing` compiled `src`'s ten other files, and no tests.
- **Scripts.** `build` and `start` in `package.json`, beside `dev`, so the same commands work
  outside a container. **Run:** the compiled `migrate.js` found `migrations/` from `dist/`, since it
  looks one folder up.

### 5. `deploying-a-version` — how a new version reaches the server

- **Build on the server.** The server keeps a clone of the repository. A deploy is `git pull`, then
  `docker compose build`, then `docker compose up -d`. The one-shot `migrate` service runs first,
  and the API waits for it to finish. **Run:** `up -d --wait` returned with `migrate` "Exited (0)",
  all 23 migrations applied as `taskco_app` to a fresh database, and the API and Caddy healthy.
  `depends_on` with `service_completed_successfully` is what holds the API back.
- **Build elsewhere and push the image to a registry**, such as GitHub's, for the server to pull.
  That needs a build machine — this one, or CI (question 10) — and a registry login on the server.

**Recommended: build on the server, from `main`**, until there is CI. If the repository is private,
the server needs a deploy key that can only read it.

*Reasoned:* the API is down for about a second while its container is replaced. A migration that
fails stops the deploy before the new API starts. `empty-migration-recorded-as-applied` matters
more here, since an empty file deployed is recorded in production for good.

### 6. `secrets-on-the-host` — passwords and where they live

- **New passwords for production**, generated, of letters and digits only. Docker part 1 found that
  `$` breaks Compose, and *reasoned:* `@`, `:` and `/` break `DATABASE_URL`.
- **They live in a `.env` beside `compose.yaml` on the server**, readable only by its owner. They
  are never in git, and never in this machine's `.env`.
- **The production database is called `taskco`.** Its name ends in neither `_test` nor `_dev`, so
  the tests' guard refuses it, and so does the seed's, once 8a gives the seed one.
- **One password written once.** *Reasoned:* Compose fills `${…}` anywhere in the file, so the
  server's `DATABASE_URL` can be built in `compose.yaml` from `TASKCO_APP_PASSWORD`. That closes
  `app-password-written-three-times` for production. This machine keeps its three copies.

**Recommended: all four.**

### 7. `before-it-is-reachable` — what must change in the code first

`login-not-rate-limited` says it must be fixed "before the server is reachable by anyone else". The
doc pass found eight more items. All of them can be built and tested on this machine, before any
server exists:

| Item | The change |
|---|---|
| `server-listens-on-localhost-only` | `HOST` and `PORT` from the environment, with today's values as the defaults |
| `no-health-check` | `GET /api/health`, above the mount, answering 200 once `select 1` does |
| `server-dies-when-the-database-goes` | a listener on the pool's `error` that logs it |
| `no-shutdown-on-sigterm` | on `SIGTERM`, stop taking requests, finish the open ones, close the pool, exit |
| `seed-has-no-guard` | the seed refuses a database whose name does not end in `_dev`, as the tests refuse one not ending in `_test` |
| `nothing-serves-the-built-frontend` | question 3 |
| `no-production-start` | question 4 |
| `dependency-advisories` | the lock file brings `zod` 4.6.7 and `body-parser` 2.4.0; `web/` pins `vite` 8.3.8 |
| `session-cookie-has-no-host-prefix` | the cookie becomes `__Host-taskco_session`. **Run:** Chrome kept it on plain `http://localhost`, so development is unaffected |

Plus `trust proxy`, below, which the rate limit needs.

**The rate limit.** Three ways:

- **A package, `express-rate-limit`.** It is the usual choice, and it hides the idea.
- **Hand-written, in the server's memory.** It counts attempts in a `Map`, keyed by address, and
  forgets them after a window. There is one process, so one memory is enough.
- **In Postgres**, which lasts across restarts and several processes. Neither is needed here.

**Recommended: hand-written, in memory**, the way passwords and cookies were done without a package.

- On `POST /sessions`, it counts failed logins by address and by the address with the email
  together. *Reasoned:* a limit by email alone would let anyone lock someone else out.
- On `POST /users`, it counts by address.
- Past the limit, the answer is 429, with a new code, `too-many-attempts`, and a `Retry-After`
  header. The numbers are a product decision. Ten failures in fifteen minutes is a common starting
  point.

*Accepted cost:* a restart forgets the counts. Design section 12's limit on invites waits, as
before.

**What stays open, on purpose.** Some things a public app usually has are not built:

- resetting or changing a password;
- verifying an email address;
- changing the timezone;
- export.

They are listed in `open-items.md`. **Recommended:** go up without them, since use is optional,
and decide each one when someone needs it.

### 8. `purge-schedule` — what runs the purge

Design section 6 says "a timer or the host's scheduler calls the same function".

- **A timer inside the API.** It purges once when the server starts, then every twenty-four hours,
  and logs what it removed. Nothing outside the image is needed, and it works on any host.
- **The host's cron**, running `node dist/purge.js` in a one-off container every night. That is a
  second thing to set up on the server, and a separate paid service on some platforms.

**Recommended: the timer**, with `npm run purge` kept for running it by hand. Purging when the
server starts makes up for a restart that cut a day short. *Reasoned:* with one process, two purges
never overlap.

That decides `gone-account-still-holds-its-address`: an account past its date holds its address for
at most a day. **Recommended:** accept that. Expired invites, which design section 12 says the same
script should take, stay waiting.

### 9. `backups` — keeping the data

On a VPS, nobody backs the database up unless something is set up to do it.

- **A nightly `pg_dump`**, by the host's cron, from the `db` container into a folder on the server,
  copied off the server regularly. A copy that stays on the server dies with it.
- **The provider's whole-server backups**, for an extra monthly fee. *Reasoned:* they copy the disk,
  so a database copied mid-write may need repair when restored. `pg_dump` takes a consistent
  snapshot.
- **A restore, rehearsed**: the night's dump loaded into a throwaway container and logged into.
  A backup is not proven until it has been restored.

**Recommended: the nightly dump, copied off, and a restore rehearsed once in 8d.** On a platform,
its backups do the first two.

### 10. `checks` — what proves a deploy worked, and a version is fit to deploy

Design section 16 put end-to-end testing off to 7g, and 7g did not take it up.

- **A smoke check after every deploy**: a short script that asks `/api/health`, logs in as an
  account kept for it, asks `/api/account`, and logs out, against the real address.
- **CI** — GitHub Actions running both suites, both type checks and the build on every push, with a
  Postgres service container. The doc pass is the argument for it. This machine's `web/` failed
  because of a stale `node_modules`, while a clean install of the same commit passed. CI is that
  clean install, every time.
- **Playwright**, driving a real browser through real flows. Still a new tool with browsers of its
  own.

**Recommended:** the smoke check in 8c. CI as 8e, after the first deploy, optional. Playwright not
yet.

---

## The slices, in order

If the recommendations hold. Each ends in something that can be checked.

| Slice | What it does | Where |
|---|---|---|
| **8a** | Question 7's table, the build config and the `build` and `start` scripts, Express serving `web/dist`, the purge timer, and the rate limit — test-first wherever a test can watch it | this machine |
| **8b** | Docker part 2: the Dockerfile, `.dockerignore`, and a production Compose file with `db`, `migrate`, `api` and `caddy`, under its own project name beside the dev one | this machine, at `https://localhost:8443` |
| **8c** | The server: an SSH key, the firewall, Docker, the DNS record, the clone, the server's `.env`, the first deploy, and the smoke check | the VPS |
| **8d** | Keeping it: the nightly dump, copying it off, a restore rehearsed, and the purge seen in the log | the VPS |
| 8e | CI, optional | GitHub |

**Done looks like:**

- From a phone on another network, the address opens over HTTPS, a person registers, makes a
  project, logs out and logs in again.
- Restarting the server loses nothing.
- The log shows the purge ran by itself.
- Last night's dump has been restored into a throwaway container and logged into.

**Pace**, as a stuck-detector, not a deadline: 8a 8–12 hours, 8b 4–6, 8c 4–8, 8d 2–4, and 8e 2–4.
That is 20 to 34 hours. 8c is the widest, because a server, DNS and certificates can each work in
minutes or eat an evening.

---

## Known traps

All run on 2026-11-20, except those marked.

- **Express 5 refuses `"*"`.** `app.get("*", …)` threw "Missing parameter name at index 1: \*" as
  the route was added, before any request. Express 5's catch-all is `"/{*splat}"`. Guides written
  for Express 4 show `"*"`.
- **A missing file answers with the page.** With the catch-all in place, `/assets/nothing.js`
  answered 200 with `index.html`. *Reasoned:* a browser still holding an older `index.html` after a
  deploy asks for the old version's hashed files. It gets HTML instead, and the script fails to
  load, with a complaint about its type. The catch-all should answer only addresses without a file
  extension, and 404 the rest.
- **Behind a proxy, every request looks like the proxy's.** Without `trust proxy`, `req.ip` was
  Caddy's container, `172.19.0.4`, for everyone, so a rate limit by `req.ip` would lock everyone out
  together. `req.secure` was `false` too, though the browser used HTTPS. With `trust proxy` set to
  `1`, `req.ip` was the real caller, and `req.secure` `true`.
- **`trust proxy` reaches the mounted app.** It was set on the outer server in `server.ts`, and
  `app`'s `req.ip` followed. Express's own documentation calls this setting the exception: other
  settings with defaults are not inherited by a mounted app.
- **Caddy drops a forged `X-Forwarded-For`.** Sent with `6.6.6.6`, the API saw only the real
  caller. That is what makes `trust proxy` `1` safe behind it.
- **Node ignores `SIGTERM` when it is a container's first process.** With no handler, `docker stop`
  took 10.5 seconds and ended in a kill, exit code 137. With a handler that closes the server, then
  the pool, it took 0.47 seconds and exited 0. *Reasoned:* `init: true` in Compose also ends it at
  once, but cuts off open requests.
- **The pool dies with the database.** Run against `taskco_test`: with one idle connection in the
  pool, `docker restart` of the database ended the process with `57P01`, "terminating connection due
  to administrator command". With an `error` listener, the process logged it, and the next query,
  four seconds later, worked. *Reasoned, from `pg`'s documentation:* an idle connection is closed
  after ten seconds, so a quiet server can survive a restart by luck. A busy one cannot.
- **`tsc` compiles the tests.** Question 4's build config is the cure.
- **Without `.dockerignore`, Windows reaches the image.** *Reasoned:* `COPY web/ ./` would copy
  `web/node_modules`, built for Windows, over the Linux install, and the build context would carry
  `.env`. The trial's `.dockerignore` leaves out every `node_modules`, every `dist`, `.env` and
  `.env.*`, `.git` and `docs`.
- **The Windows-made lock files install on Linux.** Not a trap, though it was expected to be:
  `npm ci` in the Linux image installed the Linux builds of Vite's and Sass's native parts from lock
  files made on Windows, with no complaint.
- **The production Postgres knows 487 timezone names**, as the dev container does, so
  `browser-offers-zones-postgres-lacks` is the same gap there. *Reasoned:* a platform's Postgres
  could know a different set.
- **`up --wait` and a one-shot service.** It returned with `migrate` exited 0 and the rest healthy,
  with no error.
- **Plain HTTP to the HTTPS port** answered 400 from Caddy. *Reasoned, from Caddy's
  documentation:* on a real server it also listens on port 80 and redirects to HTTPS.
- **`dotenv` in a container.** There is no `.env` in the image, so `dotenv/config` loads nothing,
  silently, and the variables Compose sets are used. Nothing changes in `server.ts` for this.
- **The seed would empty production.** *Reasoned:* `npm run seed` truncates `users` in whatever
  database `DATABASE_URL` names. On the server, that is production — `seed-has-no-guard`.

---

## Open items step 8 meets

| Item | What step 8 does to it |
|---|---|
| `server-listens-on-localhost-only`, `no-health-check`, `server-dies-when-the-database-goes`, `no-shutdown-on-sigterm`, `seed-has-no-guard`, `dependency-advisories`, `session-cookie-has-no-host-prefix`, `login-not-rate-limited` | Question 7, slice 8a |
| `nothing-serves-the-built-frontend` | Question 3, slice 8a |
| `no-production-start` | Question 4, slices 8a and 8b |
| `secure-cookie-needs-a-secure-origin` | Closed by slice 8c, once the address answers over HTTPS |
| `purge-runs-only-by-hand`, `gone-account-still-holds-its-address` | Question 8 |
| `no-database-backups` | Question 9, slice 8d |
| `app-password-written-three-times` | Question 6, for production. This machine keeps its three copies |
| `empty-migration-recorded-as-applied` | Matters more: question 5 |
| `browser-offers-zones-postgres-lacks` | Unchanged by a VPS, which runs the same image. Recheck on a platform |
| `registration-reveals-accounts` | Accepted before, with the rate limit as its defence; question 7 builds it |
| `windows-postgres-still-running` | Unchanged; its decision is still separate |
| `no-password-change-or-reset`, `email-not-verified`, `no-timezone-change`, `export-not-built` | Left open on purpose: question 7 |

---

## Prices, looked up 2026-11-20

Secondary sources, which disagree; none was checked against a bill.

| Host | What | About | Source |
|---|---|---|---|
| Hetzner | smallest shared VPS, CX23, after June 2026's price change; IPv4 extra | €5.49–5.99 a month before VAT, plus €0.50 | [Hetzner, price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Bitdoze](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/), [Better Stack](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/) |
| Render | Starter web service, and Basic-256mb Postgres | $7 and $6 a month | [Render pricing](https://render.com/pricing), [review, mid-2026](https://jwatte.com/blog/render-com-platform-review/) |
| Railway | Hobby plan, with $5 of use included | $5 a month and up | [Railway pricing plans](https://docs.railway.com/pricing/plans) |
| Fly.io | a small shared machine; Managed Postgres, Basic | about $2; $38 a month | [Fly.io resource pricing](https://fly.io/docs/about/pricing/), [Fly.io Managed Postgres](https://fly.io/docs/mpg) |
| Vercel | Hobby; cron at most once a day | free | [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
