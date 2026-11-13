# Docker, part 1 — Postgres in a container

Specified 2026-11-12, because Stjepan asked to learn Docker by setting it up himself. Step 1 put
Docker off until there was something to deploy ([`learning-path.md`](./learning-path.md), step 1).
This step brings part of it forward. Part 2, which puts the API and the frontend in containers,
still waits for deployment: hosting is still open, in design section 11. This work goes on branch
`step-docker`, made from `main`. Slice 7d stays on its own branch, built but not yet reviewed. The
two touch different files.

**Why now, when step 1 said later.** Step 1's reasons were all about the install: Windows 11 Home,
with no Hyper-V, would have needed WSL, a reboot and Docker Desktop before the first line of code.
On 2026-11-12 the machine runs Windows 11 Pro and WSL 2, with Docker Desktop 29.9.3 and Compose
5.7.0 already installed and running. Docker has never been used here: no containers and no images.
The install risk step 1 named is gone, and learning Docker is the reason to do it now.

**Checked on 2026-11-12, without running a container**, and without downloading anything:

- **The Windows Postgres, so the container can match it.** It runs version 18.6. Both databases
  are owned by `taskco_app`, which can log in and do nothing else. Both use UTF8, a Windows locale,
  and this machine's own time zone. Postgres knows 598 timezone names. It listens on port 5432.
- **The queries**, for anything that could answer differently in the container.
- **The `postgres` image's tags on Docker Hub.**

**Not yet tried in a throwaway**, unlike 7d. A trap marked *Run* below was seen. A trap marked
*Reasoned* was not, and gets checked as each piece is typed. Stjepan decides whether Claude tries
the pieces in a throwaway first.

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
  `001`. `npm test` passes, with the same number of tests as against the Windows Postgres.
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
  *Rejected — `-alpine`:* smaller (120 MB against 162 MB), but built on a different C library with
  thinner locale support, and matching the Windows setup is the point.
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

Before F1: run `npm test` once against the Windows Postgres, and note how many tests pass. F3
needs that number.

**F1 — Postgres in a container.** `compose.yaml` at the root, with one service, `db`:

- the image `postgres:18.6-trixie`;
- the superuser's password, taken from `.env` as `POSTGRES_PASSWORD`;
- port 5433 on `127.0.0.1`, passed on to 5432 inside;
- a named volume, `pgdata`, mounted at `/var/lib/postgresql`.

To look up: Compose's `services`, `image`, `environment`, `ports` and `volumes`, and how Compose
fills in a value from `.env`.

How you'll know it's right:

- `docker compose up -d` downloads the image the first time, about 160 MB, then starts it.
- `docker compose ps` lists `db` as running, with its port.
- `docker compose logs db` ends with "database system is ready to accept connections".
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
- The logs show the file being run.
- In `docker compose exec db psql -U postgres`, `\l` lists both databases, owned by `taskco_app`.
- `\du` shows `taskco_app` with no attributes, as on Windows today.

**F3 — the project uses the container.**

- `.env` and `.env.test` point at port 5433, with `taskco_app`'s password from F2.
- `.env.example` gets the two password keys, with fake values.
- Then run `npm run migrate` and `npm run migrate:test`: each applies 23 files, starting from
  `001`.
- Then `npm test`, `npm run seed`, and both dev servers. Log in as the seeded Lead in the browser.

How you'll know it's right:

- The suite passes, with the same number of tests as before F1.
- Running both migrate commands again prints "nothing to apply".
- The page shows the seeded project.

**F4 — waiting until it is ready, and starting clean.** A healthcheck on `db` runs `pg_isready`
over TCP, with `-h 127.0.0.1`, every few seconds. After that, `docker compose up -d --wait`
returns only once Postgres takes connections. Starting clean then fits on one line: take the
container down with its volume, bring it up and wait, run both migrations, then the seed.

To look up: Compose's `healthcheck` (`test`, `interval`, `retries`), `pg_isready`, and
`docker compose up --wait`.

How you'll know it's right:

- `docker compose ps` says `healthy`.
- Right after `down -v`, `up -d --wait` waits through the first start's setup, and `npm run migrate`
  works straight after it, the first time.

**C1 — the docs.** In the reference: the Docker commands, psql through the container, and the line
that starts clean. The learning path's progress log. Design section 11, on where Postgres runs.
Open items, if anything comes up. Then Stjepan goes over it.

## Pace

An estimate as a stuck-detector, not a deadline: **3 to 6 hours**, most of it in F1 and F2.

---

## Traps

- **Port 5432 is taken.** *Run:* the Windows Postgres listens on 5432. A container that asks for
  5432 will not start, with an error saying the port is not available. That is why the container
  uses 5433.
- **There are two servers, but `psql` only reaches one.** *Reasoned:* `psql -U taskco_app -d
  taskco_dev`, as the reference says today, goes to port 5432. That is the Windows Postgres, with
  its old data, so the container looks as if it did nothing. Ask the container through `docker
  compose exec db psql …`, or add `-p 5433`.
- **The first-start script runs once.** *Reasoned,* from the image's documentation: the files in
  `/docker-entrypoint-initdb.d` run only when the volume is empty. Changing `init-db.sql` later does
  nothing until `docker compose down -v`. If the script fails partway, the next start skips it and
  leaves the role or a database missing. The cure is the same: `down -v`, and start again.
- **Postgres 18 keeps its data in a new place.** *Reasoned:* the volume goes at
  `/var/lib/postgresql`. Guides written before 18 mount `/var/lib/postgresql/data`. Expect the 18
  image to stop with a message about the new place. If it starts anyway, the data is not in the
  volume, and `docker compose down` loses it. Check: data survives `down` and `up`, as Done says.
- **A password with symbols in it.** *Reasoned:* `taskco_app`'s password is written twice in
  `.env`: on its own for Compose, and inside `DATABASE_URL` for the app. Some symbols mean different
  things in each place. `@`, `:` and `/` break a URL unless they are encoded, and Compose reads `$`
  as the start of a variable. Use letters and digits only.
- **"Ready" too early.** *Reasoned:* during the first start, the image runs a temporary server for
  the setup scripts, which listens only inside the container, not on TCP. `pg_isready` without `-h`
  asks that server, and says ready while `init-db.sql` is still running. With `-h 127.0.0.1`, it
  waits for the real server. With no healthcheck at all, `up -d` returns at once, and a migrate
  straight after it fails to connect.
- **Docker Desktop has to be running.** *Reasoned:* every `docker` command talks to the engine that
  Docker Desktop starts. If Docker Desktop is closed, the commands fail with an error about
  connecting to the Docker API. It was running on 2026-11-12.
- **The server's time zone is different, but nothing reads it today.** *Run:* the Windows Postgres
  uses this machine's time zone. *Reasoned:* the image uses UTC. Every query that turns a moment
  into a day names the user's own zone: `user_today`, and a routine's first day. So no answer
  changes. A future `current_date` or `now()::date` would answer differently on the two servers.
- **Text may sort differently, but nothing sorts text today.** *Run:* every `order by` in
  `queries.ts` sorts by a position, a time or an id. The Windows databases sort text by a Windows
  locale, and the container by a Linux one. A future `order by title` could put rows in a different
  order on the two servers.
- **The list of timezone names may differ.** *Reasoned:* `is_known_timezone` checks a name against
  Postgres's own list. The Windows build knows 598 names. The container reads Debian's list, which
  may have a few more or a few fewer. The suite's zones, `Europe/Zagreb` and `Mars/Olympus`, give
  the same answer either way. The count in `today-throws-for-a-zone-the-browser-lacks` (one name,
  `Factory`) may change. Check with `select count(*) from pg_timezone_names` on both servers.
