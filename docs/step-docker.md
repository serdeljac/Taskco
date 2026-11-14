# Docker, part 1 — Postgres in a container

Specified 2026-11-12, because Stjepan asked to learn Docker by setting it up himself. Step 1 put
Docker off until there was something to deploy ([`learning-path.md`](./learning-path.md), step 1).
This step brings part of it forward. Part 2, which puts the API and the frontend in containers,
still waits for deployment: hosting is still open, in design section 11. This work goes on branch
`step-docker`, made from `main`. Slice 7d stays on its own branch, built but not yet reviewed. The
two touch different files.

**Built** 2026-11-12 to 2026-11-14 on branch `step-docker`, every piece typed by Stjepan, one commit
each. **Merged into `main`** on 2026-11-14, as a fast-forward, with no review written; not pushed.
Changed on the way:

- **From F2 on, each piece came as exact text to type,** at Stjepan's request, with what each line
  does and what to expect, rather than described as firsts are.
- **The count before F1 is the trial's,** 446 on `main`, rather than a run of Stjepan's own.
- **`.env.example` holds placeholders,** `<PASSWORD>` and `<SUPERUSER_PASSWORD>`, as it already
  did, with the same one twice for the two places `taskco_app`'s password must match.

What was met while building is in [`reference.md`](./reference.md), Docker part 1, and four items in
[`open-items.md`](./open-items.md).

**Why now, when step 1 said later.** Step 1's reasons were all about the install: Windows 11 Home,
with no Hyper-V, would have needed WSL, a reboot and Docker Desktop before the first line of code.
On 2026-11-12 the machine runs Windows 11 Pro and WSL 2, with Docker Desktop 29.9.3 and Compose
5.7.0 already installed and running, and never used before this step. The install risk step 1 named
is gone, and learning Docker is the reason to do it now.

**The Windows Postgres, so the container can match it.** It runs version 18.6. Both databases are
owned by `taskco_app`, which can log in and do nothing else. Both use UTF8, a Windows locale, and
this machine's own time zone. Postgres knows 598 timezone names. It listens on port 5432.

**Tried on 2026-11-12**, in a throwaway Compose setup outside the repo, deleted afterwards:

- F1 to F4 as described below, started fresh, restarted, and wiped;
- the migrations, the whole API suite and the seed, run against the container;
- each trap below, made to happen on purpose.

Only the image was kept. `docker image ls` shows `postgres:18.6-trixie`, so F1's first start
downloads nothing. The traps it found are at the end.

---

## What it must do

Postgres runs in a container on this machine. It holds `taskco_dev` and `taskco_test`, both owned
by `taskco_app`, as the Windows install does. The API, the tests, the migrations and the seed all
use the container, through `.env` and `.env.test`. One command line throws both databases away and
builds them fresh.

Nothing in `src/` or `web/` changes, and there is no migration.

## Done looks like

- **`docker compose up -d --wait`** starts Postgres 18.6 in a container, and returns once Postgres
  accepts connections. `docker compose ps` shows the container as `healthy`.
- **Inside the container**, `taskco_dev` and `taskco_test` are both owned by `taskco_app`, which
  can log in and do nothing else.
- **`npm run migrate` and `npm run migrate:test`** each apply all 23 migrations, starting from
  `001`. `npm test` passes, with the same number of tests as against the Windows Postgres: 446 on
  `main` on 2026-11-12.
- **`npm run seed`, then both dev servers.** Logging in as the seeded Lead works in the browser,
  against the container.
- **`docker compose down`, then up again:** the data is still there.
- **`docker compose down -v`, then up again:** both databases are empty, and the migrations apply
  again from `001`.
- **No password in any committed file.**

## Decided 2026-11-12, by Claude, for Stjepan's review

- **Only the database goes in Docker.** The API and the frontend keep running with `npm run dev`.
  *Rejected — everything in containers now:* a Dockerfile each for the API and for `web/`, plus
  dev servers watching files shared from Windows into Linux. That is all work for a deployment the
  project does not have yet.
- **Both databases go in one container**, as on Windows. *Rejected — only the test database:* two
  servers to keep in step, with `.env` and `.env.test` pointing at different ones.
- **Port 5433 on this machine, reachable from this machine only (`127.0.0.1`).** The Windows
  Postgres keeps 5432, untouched, as the way back. *Rejected — stopping the Windows service and
  taking 5432:* that changes a Windows service before the container has proven itself. Stopping it
  is a separate decision, after the container has been used for a slice.
- **The image is `postgres:18.6-trixie`, pinned.** That is the same Postgres version as Windows, and
  it names the Debian release the image is built on, so neither can change under the project.
  *Rejected — `postgres:18` or `latest`:* a newer version could arrive on any pull, unannounced.
  *Rejected — `-alpine`:* smaller (120 MB against 162 MB to download), but built on a different C
  library with thinner locale support.
- **The passwords go in `.env`, which Compose reads by itself.** That is the superuser's password
  and `taskco_app`'s, next to `DATABASE_URL`. `.env.example` gets both keys, with fake values.
  *Rejected — a password written into `compose.yaml`:* simpler, and the container is only reachable
  from this machine, but step 1's rule is that credentials never live in source control.
- **An SQL file makes the role and the databases.** The image runs it on its first start, and it
  reads `taskco_app`'s password from the container's environment. *Rejected — a shell script,* the
  usual example in guides: a second language for one job.
- **The file names.** `compose.yaml` goes at the root: it is the name Compose looks for first, and
  `docker-compose.yml` is the older name, still read. The SQL file is `docker/init-db.sql`.
- **Starting clean is one line in the reference, not an npm script.**
- **The container knows fewer timezone names than Windows, and that is accepted.** It is missing
  113 old names, such as `Asia/Calcutta` for `Asia/Kolkata`. Eighteen of them are in the list a
  browser offers on the register page, so registering with one of those would be refused by the
  container, and accepted by Windows. *Reasoned:* Taskco will not run on Windows. A Linux host
  whose Postgres reads current Debian or Ubuntu timezone data would refuse those names the same
  way, so the container shows a real gap, and the cure belongs in the app. C1 opens it as an item.
  *Rejected — a Dockerfile that adds Debian's old names back (`tzdata-legacy`):* not tried, and
  building an image is part 2's kind of thing.

## Concepts involved

- **An image and a container.** The image is the program as Docker downloads it: read-only, and
  fetched once. A container is one running copy of that image.
- **A port mapping.** A port on Windows is passed on to a port inside the container: 5433 outside,
  5432 inside.
- **A volume.** The data lives here, outside the container, so removing the container keeps the
  data. Deleting the volume is how you start clean.
- **A Compose file.** It writes down the container's settings, instead of one long `docker run`
  command, and Compose reads `.env` by itself.
- **The image's first start.** When its volume is empty, the image sets itself up, and runs your
  setup scripts. It does that only then.
- **A healthcheck.** A command Docker runs every few seconds, to ask whether the container is
  ready.

## Firsts, for Stjepan to type

Every piece is new, so every piece is Stjepan's. As before, each one is described when it is
reached, explained one idea at a time, and typed by Stjepan. Claude writes only the docs. This step
has no tests: each piece is proven by commands and by what they print, which come with the piece.

| Piece | Kind met | What |
|---|---|---|
| F1 | a Compose file | Postgres in a container, on port 5433, with a volume |
| F2 | a first-start script | `taskco_app` and its two databases, made on the first start |
| F3 | pointing the project at it | `.env`, `.env.test` and `.env.example`; then the migrations, tests, seed and dev servers |
| F4 | a healthcheck | waiting until Postgres is ready, and starting clean in one line |

---

## The pieces, in order

Before F1: run `npm test` once against the Windows Postgres, and note how many tests pass, and how
long the suite takes. F3 compares both.

**F1 — Postgres in a container.** `compose.yaml` at the root, with one service, `db`:

- the image `postgres:18.6-trixie`;
- the superuser's password, taken from `.env` as `POSTGRES_PASSWORD`;
- port 5433 on `127.0.0.1`, passed on to 5432 inside;
- a named volume, `pgdata`, mounted at `/var/lib/postgresql`.

To look up: Compose's `services`, `image`, `environment`, `ports` and `volumes`, and how Compose
fills in a value from `.env`.

How you'll know it's right:

- `docker compose up -d` starts it in about a second.
- `docker compose ps` lists `db` as running, with `127.0.0.1:5433->5432/tcp`.
- `docker compose logs db` says "database system is ready to accept connections" twice on the first
  start: once for the image's setup, and once for the real start.
- `docker compose exec db psql -U postgres -c "select version()"` says PostgreSQL 18.6, on Linux.

**F2 — the role and the two databases.** `docker/init-db.sql`, mounted read-only into the image's
`/docker-entrypoint-initdb.d` folder. It does two things:

- It makes the role `taskco_app`, which can log in and do nothing more. Its password comes from the
  container's environment, read with psql's `\getenv`.
- It makes `taskco_dev` and `taskco_test`, each owned by `taskco_app`.

`compose.yaml` gets two additions: the mount, and the password variable, taken from `.env`.

To look up: the postgres image's "Initialization scripts", psql's `\getenv` and `:'name'`, `create
role`, and `create database … owner`.

How you'll know it's right:

- The script only runs when the volume is empty, so first run `docker compose down -v`, then
  `docker compose up -d`.
- The logs show the file being run, then `CREATE ROLE` and `CREATE DATABASE` twice.
- In `docker compose exec db psql -U postgres`, `\l` lists both databases, owned by `taskco_app`.
- `\du` shows `taskco_app` with no attributes, as on Windows today.

**F3 — the project uses the container.**

- `.env` and `.env.test` point at port 5433, with `taskco_app`'s password from F2.
- `.env.example` gets the two password keys, with fake values.
- Then run `npm run migrate` and `npm run migrate:test`: each applies 23 files, starting from
  `001`.
- Then `npm test`, `npm run seed`, and both dev servers. Log in as the seeded Lead in the browser.

How you'll know it's right:

- The suite passes, with the same number of tests as before F1. In the trial it was 446 on both,
  and it took 28 seconds against the container, against 165 against the Windows Postgres.
- Running both migrate commands again prints "nothing to apply".
- The page shows the seeded project.

**F4 — waiting until it is ready, and starting clean.** A healthcheck on `db` runs `pg_isready`
every few seconds, over TCP with `-h 127.0.0.1`, and as `-U postgres`. After that, `docker compose
up -d --wait` returns only once Postgres takes connections. Starting clean then fits on one line:
take the container down with its volume, bring it up and wait, run both migrations, then the seed.

To look up: Compose's `healthcheck` (`test`, `interval`, `retries`), `pg_isready`, and
`docker compose up --wait`.

How you'll know it's right:

- `docker compose ps` says `(healthy)`.
- Right after `down -v`, `up -d --wait` takes about 3 seconds, and `npm run migrate` straight after
  it applies all 23 files, the first time.
- `docker compose logs db` has no `FATAL` lines.

**C1 — the docs.** In the reference: the Docker commands, psql through the container, and the line
that starts clean. The learning path's progress log. Design section 11, on where Postgres runs.
Open items: `browser-offers-zones-postgres-lacks`, from the decision above. Then Stjepan goes over
it.

## Pace

An estimate as a stuck-detector, not a deadline: **3 to 5 hours**, most of it in F1 and F2.

---

## Traps

- **Port 5432 is taken.** *Run:* asked for 5432, Docker said "ports are not available: exposing
  port TCP 127.0.0.1:5432", because the Windows Postgres holds it. The container was created, but
  never started. That is why the container uses 5433.
- **Postgres 18 keeps its data in a new place.** *Run:* with a volume at `/var/lib/postgresql/data`,
  as guides written before 18 say, the container stopped at once, with an error that begins "in
  18+, these Docker images are configured to store database data in a format which is compatible
  with pg_ctlcluster". The image keeps its data in `/var/lib/postgresql/18/docker`, so the volume
  goes at `/var/lib/postgresql`.
- **The first-start script runs once.** *Run:* the script was changed, then `down` and `up`, and
  the logs showed it was not run again. With a typo in it, the first start stopped with "exited
  (3)", and `up --wait` failed. After fixing the typo, a plain `up` came up healthy, but
  `taskco_test`, whose line had the typo, did not exist. The cure is `down -v`, and start again.
- **A missing password gives a role with no password, and no error.** *Run:* with
  `TASKCO_APP_PASSWORD` left out of `.env`, Compose warned that the variable "is not set. Defaulting
  to a blank string", and carried on. Postgres said "empty string is not a valid password, clearing
  password". The container came up healthy, `taskco_app` existed, and the app's login failed with
  `password authentication failed for user "taskco_app"`. Adding the password to `.env` afterwards
  changes nothing until `down -v`.
- **A password with symbols in it.** *Run:* `ab$cd12` in `.env` reached the container as `ab`, with
  a warning that the variable `cd12` is not set: Compose reads `$` as the start of a variable.
  *Reasoned:* `@`, `:` and `/` break `DATABASE_URL` unless they are encoded. Use letters and digits
  only.
- **"Ready" too early.** *Run:* during a first start with a setup script slowed to 8 seconds,
  `pg_isready` over the socket said "accepting connections" from 2 seconds in, and over TCP only
  from 10.7 seconds. The socket answers the image's setup server, which TCP cannot reach. With no
  healthcheck, `up -d` returned in under a second, and `psql` 2 seconds after a plain restart got
  "the database system is starting up". A migrate straight after a fresh `up -d` once worked, by
  luck: setup took under a second.
- **`pg_isready` without `-U` fills the log.** *Run:* it connects as the container's own user,
  `root`, and the log says `FATAL: role "root" does not exist` each time. With `-U postgres`, the
  log stays clean.
- **There are two servers, but `psql` only reaches one.** *Reasoned:* `psql -U taskco_app -d
  taskco_dev`, as the reference says today, goes to port 5432. That is the Windows Postgres, with
  its old data, so the container looks as if it did nothing. Ask the container through `docker
  compose exec db psql …`, or add `-p 5433`.
- **Docker Desktop has to be running.** *Reasoned:* every `docker` command talks to the engine that
  Docker Desktop starts. If Docker Desktop is closed, the commands fail with an error about
  connecting to the Docker API.
- **The timezone names differ.** *Run:* the container knows 487 names and Windows knows 598. The
  113 that only Windows knows are all old names, such as `Asia/Calcutta`, `Europe/Kiev`,
  `US/Pacific` and the `Canada/` ones. Eighteen of them are in Node 24's `Intl` list, which is what
  the register page offers, in a browser's own version. `Factory` is in both, so the count of one in
  `today-throws-for-a-zone-the-browser-lacks` stands. The suite's zones are in both. See the
  decision above.
- **The server's time zone is different, but nothing reads it today.** *Run:* the container's is
  `Etc/UTC`, and Windows's is this machine's. Every query that turns a moment into a day names the
  user's own zone: `user_today`, and a routine's first day. So no answer changes. A future
  `current_date` or `now()::date` would answer differently on the two servers.
- **Text may sort differently, but nothing sorts text today.** *Run:* the container's databases sort
  by `en_US.utf8`, and the Windows ones by a Windows locale. Every `order by` in `queries.ts` sorts
  by a position, a time or an id. A future `order by title` could put rows in a different order on
  the two servers.

Also run: a Windows line ending in `init-db.sql` is harmless, so `\getenv` read the password
correctly from a file saved with CRLF. A folder on `H:` mounts into a container with no setup.
`down` without `-v` kept the seeded rows.
