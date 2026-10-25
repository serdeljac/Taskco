# Taskco — reference

Every file, organised by the step that built it. For each one: **the code**, **what it does**, and
**what is still open** in that file.

Code blocks are a snapshot taken 2026-09-18, except steps 5 and 6's, taken 2026-10-22, and the review
fixes after them, taken 2026-10-24. If a block ever disagrees with the file, the file wins.
Inline comments are stripped here so the code reads as code.

Longer reasoning for the open items is in [`slice-a-review.md`](./slice-a-review.md). This file is
for looking things up.

**The `Open` note under each file says what is still wrong with that file. It does not say whether
it has been fixed** — [`open-items.md`](./open-items.md) is the one place that answers that, and
each item there carries a name that does not change. Roughly eighteen of the notes below appear in
no review at all, which is why they are still written out here in full rather than moved.

---

## Commands

Run from `H:\Github\Taskco` in PowerShell.

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` — are the types right? Silence means yes. |
| `npm run migrate` | Applies pending migrations to **taskco_dev** |
| `npm run migrate:test` | Applies pending migrations to **taskco_test** |
| `npm test` | Runs the test suite once |
| `npx vitest run -t "second lead"` | Runs only the tests whose name contains that text |
| `npx vitest run src/test_queries/1_users.test.ts` | Runs one test file |
| `npx vitest list` | Shows which tests exist, without running them |
| `npx vitest run --sequence.shuffle` | Random order, to prove the tests are independent |
| `npx vitest` | Watch mode — re-runs on save |
| `psql -U taskco_app -d taskco_dev` | Interactive session. `\q` to leave. |
| `psql -U taskco_app -d taskco_dev -c "\d memberships"` | Describe one table without a session |
| `psql -U taskco_app -d taskco_test -c "select * from memberships"` | What the last test left behind |
| `npm run seed` | Empties **taskco_dev** and fills it with a demo project, tasks and subtasks |
| `npm run preview` | Writes `preview.html` from **taskco_dev**, as user 1 sees it |
| `npx tsx src/preview.ts 2` | The same page, as user 2 sees it |
| `Invoke-Item preview.html` | Opens the page in your browser |
| `npm run purge` | Deletes every project in **taskco_dev** past its deletion date, with everything under it, then every account past its date that no longer leads a project |
| `npm run dev` | Starts the server on `http://127.0.0.1:3000/api` against **taskco_dev**, and restarts it whenever a file changes. `Ctrl+C` stops it |
| `curl.exe -c cookies.txt --json '{"email":"lead@example.com","password":"taskco-demo"}' http://127.0.0.1:3000/api/sessions` | Logs in to the running server as the seeded Lead, and saves the session cookie in `cookies.txt`. Run it in a second terminal |
| `curl.exe -b cookies.txt http://127.0.0.1:3000/api/projects` | Asks as whoever `cookies.txt` is logged in as. Any `GET` in the endpoint tables works the same way |
| `curl.exe -b cookies.txt -c cookies.txt -X DELETE http://127.0.0.1:3000/api/sessions/current` | Logs out, and empties the cookie in `cookies.txt` |
| `npx vitest run src/test_http` | Runs only the HTTP tests |

**If `curl` cannot connect, the server is not running.** Look in the `npm run dev` terminal: an error
there stops the server while `tsx watch` stays open, waiting for a change. `EADDRINUSE` means
something else already holds port 3000.

**Every new migration needs both migrate commands.** Nothing does this for you.

**Save a migration before running either command.** An empty file is applied, recorded in
`schema_migrations`, and never run again — even after the SQL is written into it.

Inside psql: `\l` databases, `\dt` tables, `\du` roles, `\d <table>` one table. A `-#` prompt instead
of `=#` means the statement is unfinished — type a semicolon.

**If PowerShell says `psql` is not recognised,** the terminal was opened before PostgreSQL was added
to PATH, and never saw the change. Restart the editor, or call it by its full path:
`& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U taskco_app -d taskco_dev`.

---

# Step 1 — Environment

PostgreSQL installed natively, a Node project on ESM with strict TypeScript, and a migration runner
written by hand.

## Configuration files

| File | What it does |
|---|---|
| `.env` | `DATABASE_URL` for `taskco_dev`. Git-ignored. |
| `.env.test` | `DATABASE_URL` for `taskco_test`. Git-ignored. |
| `.env.example` | The keys a fresh clone needs, with fake values. Committed. |
| `.gitattributes` | `* text=auto eol=lf` — line endings normalised in the repository |
| `tsconfig.json` | `strict`, `nodenext`, target ES2022, source in `src`, output to `dist`. `noUncheckedIndexedAccess` added before slice B — see below |
| `package.json` | `"type": "module"`, dependencies, and the commands above |

**Open**

- `.env.example` documents `DATABASE_URL` but never mentions that `.env.test` is also required. A
  fresh clone can pass setup and then fail at `npm test` with nothing pointing at the cause.

## `src/db.ts`

```ts
import { Pool, types } from "pg";

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error("DATABASE URL environment variable is not set");
}

types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({connectionString});
```

**What it does.** Reads the connection string, refuses to start without one, makes `date` columns
arrive as text, and creates the connection pool.

**`types.setTypeParser(...)`**, added in slice B, hands every `date` over exactly as the database
sent it — `"2026-09-18"`. By default `pg` turns a `date` into a JavaScript `Date`, which is a moment:
midnight on this machine's clock, which moves the day depending on where the code runs. It lives here
rather than in `queries.ts` because every file that reaches the database imports this one, and
`migrate.ts` and `setup.ts` never touch `queries.ts`.

Exports `pool`. Everything else imports it rather than building its own — a module body runs once
and the result is cached, so there is exactly one pool per process. That is what makes closing it in
`afterAll` correct rather than reckless.

The `if` block does two jobs: it fails fast with a message naming the real problem, and it narrows
the type so `connectionString` is a `string` on the next line rather than `string | undefined`.

**Open**

- The message says `DATABASE URL` but the variable is `DATABASE_URL`. Searching the codebase for the
  string in the error finds nothing.

## `migrations/001_create_users.sql`

```sql
create table users (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now()
);
```

**What it does.** The first table, deliberately minimal — two columns, both generated by the
database. Its real job was to give the migration runner something to apply.

`generated always as identity` means Postgres owns the value and rejects any attempt to supply your
own. `timestamptz` rather than `timestamp` because a creation time is a *moment*, and a moment
without a timezone reference is unrecoverable later.

**Open** — nothing.

## `src/migrate.ts`

```ts
import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { pool } from "./db.js"

const migrationsDir = path.join(import.meta.dirname, "..", "migrations");

await pool.query(`
    create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
    )
`);

const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

const { rows } = await pool.query("select filename from schema_migrations");
const applied = new Set(rows.map((r) => r.filename));

let count = 0;

for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();

    try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
            "insert into schema_migrations (filename) values ($1)",
            [file]
        );
        await client.query("commit");
        console.log(`applied ${file}`);
        count++;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

if (count === 0) console.log("nothing to apply");

await pool.end();
```

**What it does.** Brings any database up to date with the migrations folder.

It creates its own bookkeeping table first — that table cannot itself be a migration, because
reading the list of applied migrations requires it to already exist. `if not exists` makes running
it every time harmless.

`.sort()` is load-bearing: a directory read returns whatever order the filesystem felt like, and
nobody promised it would be alphabetical.

**The important part is the transaction.** Applying a migration and recording that you applied it
happen together or not at all. Without that, a crash between the two would leave a changed schema
that the bookkeeping says was never changed, and the next run would apply it again on top of itself.

It also means **"recorded" is proof of "applied"** — there is no state where `schema_migrations`
lists a file whose SQL did not run.

A migration runs **once**. What it leaves behind is rules stored in the database, and those act on
every row written afterwards — the database never reads the file again.

**Open**

- A new migration must be run against both databases by hand. Forgetting `migrate:test` leaves the
  test database a step behind, and the tests then fail for reasons that have nothing to do with the
  change.
- An empty migration file is applied successfully and recorded, so SQL written into it later never
  runs. Nothing warns about an empty file.
- On failure `pool.end()` is never reached. The process exits non-zero anyway, so this is untidy
  rather than broken.
- There is no way to see what has been applied except by querying `schema_migrations` yourself.

---

# Step 2 — Slice A: identity and membership

Three tables, five queries, and tests that prove the database refuses bad data.

## `migrations/002_add_user_fields.sql`

```sql
alter table users
    add column email text not null,
    add column timezone text not null;

create unique index users_email_lower_idx on users (lower(email));
```

**What it does.** Adds the two columns a user needs, and makes email unique **case-insensitively**.

The index is *functional* — it indexes the result of `lower(email)` rather than the column, so
`Stjepan@x.com` and `stjepan@x.com` collide. The address itself is stored exactly as typed; only the
comparison is lowercased.

`not null` worked here only because the table was empty. On a populated table the pattern is three
steps: add the column nullable, fill it in, then add the constraint.

**Open**

- The index is only *used* by queries written `where lower(email) = lower($1)`. Nothing enforces
  that, and no query looks users up by email yet. **Step 6 authentication is where this bites** — a
  case-sensitive lookup silently fails to find a real account, and it will work fine in testing
  because you type the address the same way every time.
- `timezone` accepts any string. `Mars/Olympus` inserts happily. Postgres knows the valid names in
  `pg_timezone_names`, and the design leans on timezones for overdue dates and routine streaks.
- `email` has no format or length constraint. Zod covers this at the HTTP boundary in step 5, but a
  boundary check protects the user experience, not the database.

## `migrations/003_create_projects.sql`

```sql
create table projects (
    id bigint generated always as identity primary key,
    name text not null,
    created_at timestamptz not null default now()
);
```

**What it does.** Three columns, and the interesting part is what is missing.

**No `lead_user_id` and no `created_by`.** Leadership is a membership row with `role = 'lead'`, so
there is nowhere for a stale copy to live. When leadership transfers, exactly one row changes and
nothing can disagree with it.

**Open**

- Nothing has ever deleted a project, so the `on delete cascade` on memberships is unverified.
- Delete mode adds columns here in slice C, and with them a second visibility filter alongside
  `ended_at is null`. That is when "one place decides what is visible" stops being theoretical.

## `migrations/004_create_memberships.sql`

```sql
create table memberships (
    id bigint generated always as identity primary key,
    user_id bigint not null references users (id) on delete cascade,
    project_id bigint not null references projects (id) on delete cascade,
    role text not null check (role in ('lead', 'associate')),
    created_at timestamptz not null default now(),
    ended_at timestamptz
);

create index memberships_user_id_idx on memberships (user_id);

create unique index memberships_one_active_idx
    on memberships (user_id, project_id)
    where ended_at is null;
```

**What it does.** The join table the whole design hangs from. Role lives here because it belongs to
neither users nor projects — you can lead one project and be an associate on another.

`references` makes a membership pointing at a non-existent user unwritable. `on delete cascade`
answers what happens when a parent is genuinely deleted, which in this design only happens when
delete mode expires. Soft deletion is `ended_at`, and the database has no idea that column means
anything.

`ended_at` is nullable, and **the null carries meaning**: null is "still a member," a date is "left
on this date."

**The partial unique index** holds entries only for rows where `ended_at is null`. Ended rows are
not in the index at all, so they can repeat freely — which is what makes re-invitation possible —
while a second *active* membership for the same person and project is impossible to write.

**Open**

- **Fixed before slice B — one lead per project.** Nothing used to enforce it: `addMember` could add
  a second lead and `removeMember` could remove the only one. *At most one* is now migration `006`;
  *at least one* is a check in `removeMember`, because no constraint can require that a row exists.
- `ended_at` can be earlier than `created_at`. A `CHECK` would forbid it — and migration `014` does.
- **Fixed by migration `020` — `ended_at` in the future.** This note used to say a `CHECK` *cannot*
  forbid it, because check expressions must be immutable. That was wrong: Postgres only assumes a
  check is immutable, and runs it once, when the row is written. "Not in the future" never flips, so
  `check (ended_at <= now())` is safe.
- **Fixed by migration `021` — no index on `project_id`.** "Who is in this project" scanned the
  table. This note said the composite index cannot help because an index is only usable from its
  leading column; *corrected 2026-10-22:* Postgres 18 can use a later column of an index, by skip scan: it searches once for each distinct value of the leading column. Cheap when that column has few values — two searches, for one user leading 20,000 projects — and no better than reading the table when it has many.
- The foreign keys, the role `CHECK`, and the cascade are all untested.
- The index on `user_id` can never be tested — indexes affect speed, not results. `EXPLAIN` is how
  you check those.

## `migrations/005_require_non_blank_text.sql`

```sql
alter table projects
    add constraint projects_name_not_blank
    check (length(trim(name)) > 0);

alter table users
    add constraint users_email_not_blank
    check (length(trim(email)) > 0),
    add constraint users_timezone_not_blank
    check (length(trim(timezone)) > 0);
```

**What it does.** Closes a gap found during the slice A review: **`not null` does not mean "not
empty."** It rejects `NULL` and happily accepts `''`, which is what a blank form field actually
sends. `trim` matters too, or three spaces would pass.

Constraints are named explicitly here so violations say *which* rule broke.

Adding a `CHECK` validates every existing row and fails the whole migration if any violate it —
which is why constraints are cheap to add early and expensive later.

**Open** — nothing.

## `src/queries.ts` — the slice A functions

The block below is the file as slice A left it: five functions and three types. It has since grown
to fifteen exported functions and seven types — the rest are summarised under step 3, because the
file is now long enough that reproducing it would be copying rather than explaining.

```ts
import { pool } from "./db.js";

export type User = {
    id: string;
    email: string;
    timezone: string;
    created_at: Date;
};

export type Project = {
    id: string;
    name: string;
    created_at: Date;
};

export type Role = "lead" | "associate";

export async function createUser(email: string, timezone: string): Promise<User> {
    const { rows } = await pool.query<User>(
        `insert into users (email, timezone)
         values ($1, $2)
         returning *`,
        [email, timezone]
    );

    const user = rows[0];
    if (!user) {
        throw new Error("createUser: the insert returned no row");
    }
    return user;
}

export async function createProject(name: string, userId: string): Promise<Project> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const { rows } = await client.query<Project>(
            `insert into projects (name)
             values ($1)
             returning *`,
            [name]
        );

        const project = rows[0];
        if (!project) {
            throw new Error("createProject: the insert returned no row");
        }

        await client.query(
            `insert into memberships (user_id, project_id, role)
             values ($1, $2, 'lead')`,
            [userId, project.id]
        );

        await client.query("commit");
        return project;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function addMember(member: {
    projectId: string;
    userId: string;
    role: Role;
}): Promise<void> {
    await pool.query(
        `insert into memberships (user_id, project_id, role)
         values ($1, $2, $3)`,
        [member.userId, member.projectId, member.role]
    );
}

export async function removeMember(member: { projectId: string; userId: string }): Promise<void> {
    const { rows } = await pool.query(
        `select role from memberships
         where project_id = $1
         and user_id = $2
         and ended_at is null`,
        [member.projectId, member.userId]
    );

    if (rows.length > 0 && rows[0].role === "lead") {
        throw new Error("Cannot remove the project's lead");
    }

    await pool.query(
        `update memberships
         set ended_at = now()
         where project_id = $1
         and user_id = $2
         and ended_at is null`,
        [member.projectId, member.userId]
    );
}

export async function listProjectsForUser(userId: string): Promise<Project[]> {
    const { rows } = await pool.query<Project>(
        `select p.*
         from projects p
         join memberships m on m.project_id = p.id
         where m.user_id = $1
         and m.ended_at is null
         order by p.created_at`,
        [userId]
    );
    return rows;
}
```

**What it does.** The only file in the project that writes SQL. Everything above it calls these
functions and never learns there is a join involved.

`id` is a **string**, not a number — `bigint` exceeds what JavaScript represents exactly, so the
driver returns text rather than silently losing precision.

Every value goes in as `$1`, `$2` — the SQL text and the data travel separately, so data can never be
read as commands.

`returning *` hands back the inserted row, including the values the database generated.

**`createProject` is the only transactional one.** It writes two rows in two tables where the second
needs the first's id, and a project without a Lead is a state nothing in the app knows how to repair.
`pool.connect()` reserves one connection so `begin` and `commit` reach the same place.

**`if (!user)` and `if (!project)`** exist because `noUncheckedIndexedAccess` makes `rows[0]` a
`User | undefined`. After an insert with `returning *` the row is always there, so neither ever
fires — they state that expectation instead of assuming it. In `createProject` the `throw` sits inside
`try`, so the project row is still rolled back.

**`addMember` and `removeMember` take one labelled object.** Both ids are strings, so positional
arguments could be swapped without TypeScript noticing — and if both ids happened to exist, the
database would save the wrong person into the wrong project without complaint. `createProject(name,
userId)` stays positional: a swap there puts a name where a `bigint` belongs, which the database
refuses.

**`removeMember` refuses to remove the Lead.** It looks up the member's role and throws before ending
anything. This is the *at least one* half of the one-Lead rule; migration `006` is the *at most one*
half. It throws rather than returning a "no", because a returned value can be ignored.

`removeMember`'s `and ended_at is null` prevents re-ending an already-ended membership, which would
overwrite the original date and falsify the history.

`listProjectsForUser`'s `and m.ended_at is null` is soft deletion in a query. Remove it and people
keep seeing projects they left — proven by experiment.

**Open**

- `removeMember` ignores the `update`'s `rowCount`, so it cannot tell "removed them" from "they were
  not a member." Step 5 needs that to choose between success and 404.
- `removeMember` checks and then writes in two separate statements. If a transfer made someone the
  Lead in between, the `update` would still end their membership. Transfer does not exist yet; when
  it does, the check and the write may need to share a transaction.
- The `select` in `removeMember` declares no row type, so its rows are `any`, which
  `noUncheckedIndexedAccess` never checks. `rows.length > 0` is what keeps `rows[0].role` safe.
- `order by p.created_at` has **no tiebreaker**. Two projects created in the same microsecond can
  come back in either order, and Postgres is not obliged to be consistent between runs.
  `order by p.created_at, p.id` makes it total.
- `select p.*` returns whatever columns the table currently has while `<Project>` claims three. They
  agree today; slice C adds columns and they stop agreeing, with nothing to announce it.

## `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        setupFiles: ["./src/testing/setup.ts"],
        fileParallelism: false,
        reporters: ["verbose"],
    },
});
```

**What it does.** Names the setup file, stops test files running in parallel, and prints every test
by name.

`fileParallelism: false` is not optional. Every test file talks to the same database, so two running
at once means one truncating tables while the other is mid-test — failures that appear and vanish
depending on timing.

`reporters: ["verbose"]` prints one line per test on every terminal. The default printed the list
only in some terminals and a bare count in others.

**Open** — nothing.

## `src/testing/env.ts`

```ts
import { config } from "dotenv";
import path from "node:path";
import { isTestDatabase } from "./guard.js";

config({
    path: path.join(import.meta.dirname, "..", "..", ".env.test"),
    quiet: true,
});

const url = process.env.DATABASE_URL;

if (!url || !isTestDatabase(url)) {
    throw new Error(
        "Refusing to run: DATABASE_URL must name a database ending in _test"
    );
}
```

**What it does.** Loads the test connection string and refuses to run against anything that is not a
test database.

It is a **separate file, imported first**, rather than a function call inside `setup.ts` — because
ESM evaluates every import before any module body runs. A `config()` call in the body would happen
*after* `db.ts` had already read the environment, which is exactly the bug this project hit.

The path to `.env.test` is built from `import.meta.dirname`, this file's own folder, so it is found
whichever folder the tests are started from.

The decision itself lives in `isTestDatabase`, in `guard.ts`, where it can be tested. This file only
loads the address and acts on the answer. `!url` comes first because `||` stops at the first `true`,
so a missing address is refused before `isTestDatabase` is handed nothing.

It also fails safe in a case it was not written for: if `.env.test` goes missing, `dotenv` loads
nothing silently, and the guard then catches either an unset variable or a shell variable still
pointing at `taskco_dev`.

**Open**

- The result of `config()` is discarded, so a missing `.env.test` surfaces as a different complaint
  than the one that actually happened.

## `src/testing/setup.ts`

```ts
import "./env.js";
import { pool } from "../db.js";
import { beforeEach, afterAll } from "vitest";

beforeEach(async () => {
    await pool.query(
        "truncate table memberships, projects, users restart identity cascade"
    );
});

afterAll(async () => {
    await pool.end();
});
```

**What it does.** Resets the database before every test and closes the pool at the end.

`truncate` empties tables wholesale rather than deleting rows one at a time; the tables themselves
stay. `restart identity` resets the id counters so every test starts from id 1 and assertions are
predictable.

**`cascade` also empties every table that references the ones named** — and every table that
references those, all the way down. Slice B's `tasks` will reference `projects` and `subtasks` will
reference `tasks`, so both are emptied without being listed.

The tables are emptied **before** each test, not after, so the last test's rows stay in `taskco_test`
until the next run. That is useful: `psql` can show exactly what a test wrote.

Closing the pool matters for the same reason it did in step 1: leave connections open and the
process never exits.

Runs **per test file**, not per test.

**Open**

- A table that references none of `users`, `projects` or `memberships` would survive between tests,
  because `cascade` only follows foreign keys. Nothing in the design is shaped like that. *(This
  replaces an earlier note claiming slice B's tables would survive — `cascade` already covers them.)*
- Closing the pool here is correct only because Vitest isolates each test file's modules by default.
  Setting `isolate: false` for speed would make files share a pool, and the first to finish would
  close it underneath the others.

## The slice A tests — now in `src/test_queries`

*Moved 2026-10-08.* The tests used to live in one file, `src/queries.test.ts`. They are now split
into `src/test_queries`, one file per table — `1_users`, `2_memberships`, `3_projects`, `4_tasks`,
`5_subtasks`, `6_invites`, `7_routines` — plus two that never touch the database, `guard.test.ts`
and `streak.test.ts`. A test's group is also its file. The numbers are for reading order only:
Vitest decides the order files run in, which is safe because every test empties the tables first.
Each test is laid out in two parts, `//CREATE` for the setup and `//TEST` for the act and the
checks. 150 tests in nine files after the step 4c review's fixes — about twelve seconds, since every
new user costs a timezone lookup.

This section covers slice A's ten tests; the task and subtask tests are listed under step 3. The
listing below shows the groups as slice A left them — the email test has since moved to `users`.

Of slice A's ten, **six assert that something is refused**, which is the unusual and valuable half.

```
users
  returns a row the database generated
projects
  makes the creator a member of the project
  gives the creator the lead role, not associate
  refuses a project with a blank name
  refuses two users with the same email in different cases
memberships
  refuses to add the same person to a project twice
  returns only the projects a user belongs to
  stops listing a project once the member has left
  refuses a second lead on the same project
  refuses to remove the project's lead
```

The shape the refusal tests follow:

```ts
it("refuses a second lead on the same project", async () => {
    const lead = await createUser("lead@example.com", "Europe/Zagreb");
    const other = await createUser("other@example.com", "Europe/Zagreb");
    const project = await createProject("Website", lead.id);

    await expect(
        addMember({ projectId: project.id, userId: other.id, role: "lead" })
    ).rejects.toMatchObject({ code: "23505", constraint: "memberships_one_lead_idx" });
});
```

**The attempt is deliberately not awaited** — you hand the promise to `expect`, not its result.
Awaiting it would throw before `expect` ever saw it. `.rejects` says the promise must reject;
`toMatchObject` checks the error *contains* those fields, because the error carries a dozen others.
Asserting the **code** rather than the message means the test survives a Postgres upgrade changing
the wording.

**`.rejects` checks for a refusal — it cannot cause one.** Written before migration `006` existed,
this test failed with *promise resolved instead of rejecting*: the database had saved a second lead.

**`constraint` names which rule refused.** `memberships` has two unique indexes, and both raise
`23505`. With the code alone, the test still passed when changed to add the existing lead again —
refused by the *other* index. With the name, that change fails.

`refuses to remove the project's lead` checks `message` instead. That refusal comes from
`removeMember`, not the database, so there is no database code to check.

Lists are read with `projects[0]?.id`. If the list were empty, the value is `undefined` and the
assertion fails with a clear message rather than a crash.

Vitest finds test files by **filename** — anything containing `.test.`. Nothing lists them, and
renaming one to `.tests.` makes it silently disappear with no error.

**Open**

- "refuses two users with the same email in different cases" sits in the `projects` describe. It is a
  users test, and the describe path is what you read when something fails.
- The grouping axis is inconsistent — `users` and `projects` are tables, but `memberships` holds tests
  that are really about `listProjectsForUser`. Pick one axis before there are thirty tests.
- Independence is assumed, not proven. `npx vitest run --sequence.shuffle` would demonstrate it.
- "gives the creator the lead role" reads `rows[0].role` from an untyped query, so the row is `any`
  and `noUncheckedIndexedAccess` does not check it.
- Not covered: foreign keys, the role `CHECK` (which needs a deliberate TypeScript bypass), the
  cascade, `removeMember` on a non-member, and ordering.

---

# Before slice B — review fixes

The items [`slice-a-review.md`](./slice-a-review.md) marked for doing before slice B, built test-first
on branch `slice-a-fixes`: each test was written and seen to fail before the change that made it
pass. Changed files are updated in place above; the new ones are here.

## `migrations/006_limit_one_lead_per_project.sql`

```sql
create unique index memberships_one_lead_idx
    on memberships (project_id)
    where role = 'lead' and ended_at is null;
```

**What it does.** Among memberships that are leads and have not ended, the same project cannot
appear twice — so a second active Lead is unwritable, whichever code tries. The same shape as
`memberships_one_active_idx` in `004`, keyed on the project alone.

Associates are not in the index, so a project can have any number. Ended memberships are not in it
either, so a former Lead's history row never blocks the next one.

This is *at most one*. *At least one* cannot be a constraint, and lives in `removeMember`.

**Open**

- A unique index is checked as each row is written, not at commit. Leadership transfer, when it is
  built, must demote the outgoing Lead before promoting the new one, inside one transaction. Promote
  first and this index refuses it.

## `src/testing/guard.ts`

```ts
export function isTestDatabase(url: string): boolean {
    const databaseName = new URL(url).pathname.slice(1);
    return databaseName.endsWith("_test");
}
```

**What it does.** Decides whether an address names a test database. `env.ts` calls it with the real
address; the tests below call it with addresses nothing connects to.

It judges the **database name**, not the address. A string has no parts, so `new URL(url)` builds an
object from it with labelled ones: `.pathname` is `/taskco_test`, and `.slice(1)` drops the slash.
Anything after `?` is an extra setting and never reaches the name.

The old check was `endsWith("_test")` on the whole address, which
`/taskco_dev?application_name=_test` passed while pointing at the development database.

It lives in its own file so it can be tested. `env.ts` throws while being imported, which no test can
catch; a function that returns `true` or `false` can be asserted.

**Open**

- An address that is not a valid URL makes `new URL` throw, so the tests stop with "Invalid URL"
  rather than the guard's message. They still refuse to run, which is the part that matters.

## `src/test_queries/guard.test.ts`

*Moved 2026-10-08* from `src/testing`, with the other test files; it imports `../testing/guard.js`.

```
isTestDatabase
  accepts a database named taskco_test
  refuses a database named taskco_dev
  refuses taskco_dev even when the address ends in _test
```

**What it does.** Three addresses, three answers. The first proves the guard lets the real test
database through — if it wrongly said no, no test could ever run. The second is its basic job. The
third is the case the old check got wrong, and it failed until `guard.ts` parsed the URL.

No `async`: these tests never touch the database, they only hand the function text. `setup.ts` still
empties the tables before each one, because it runs for every test file.

**Open** — nothing.

## `tsconfig.json`: `noUncheckedIndexedAccess`

**What it does.** Makes reading a list by position honest. `rows[0]` becomes `User | undefined` rather
than `User`, because TypeScript knows what a list holds but never how many — it never runs the code
and cannot see the database. The empty case has to be handled before the item is used:
`if (!user) throw` in code, `projects[0]?.id` in tests.

Turned on before slice B because slice B brings the first lookups that can genuinely return nothing,
and at the time only five places needed changing.

*Rejected — `projects[0]!.id`:* the `!` tells TypeScript "trust me, it is there." It silences the
check without performing one, which is what the setting exists to prevent.

**Open**

- It cannot check `any`. A query with no row type — `pool.query(...)` rather than
  `pool.query<User>(...)` — returns `any` rows, and `rows[0].role` passes unchecked. Every slice B
  query should declare a row type.

---

# Step 3 — Slice B: tasks and subtasks

Tasks and subtasks, with status, priority, due dates, soft deletion, manual ordering and notes. Built
one idea per piece, with each migration applied to both databases. The checkpoint is
[`slice-b-review.md`](./slice-b-review.md).

## Migrations 007–023

| File | What it adds |
|---|---|
| `007_create_tasks.sql` | `tasks`: `id`, `project_id` → `projects`, a non-blank `title`, `created_at`; an index on `project_id` |
| `008_add_task_status_and_priority.sql` | `status`, required and starting at `not_started`; `priority`, empty until someone decides. Both checked against their lists |
| `009_add_task_due_date.sql` | `due_date`, a `date`: a calendar day with no time and no timezone |
| `010_soft_delete_tasks.sql` | `deleted_at`, and the `visible_tasks` view |
| `011_add_task_position.sql` | `position`; re-creates `visible_tasks` |
| `012_create_subtask.sql` | `subtasks`: the task fields, with `task_id` → `tasks` as the parent; `visible_subtasks` |
| `013_add_notes.sql` | `notes` on both tables, blank refused; re-creates both views |
| `014_soft_delete_timestamp_unchecked.sql` | Three `CHECK` constraints: `ended_at` and `deleted_at` cannot fall before `created_at`. Named for the problem rather than the change |
| `015_add_task_assignee.sql` | `assignee_membership_id` on both tables. A composite foreign key ties a task's assignee to a membership in the task's own project, which needs a redundant-looking unique constraint on `memberships (id, project_id)`; `on delete set null` takes a column list so it empties only the assignee. Subtasks get a plain reference, having no `project_id` to pair. Both views re-created |
| `016_create_invites.sql` | `invites`: project, email, sender, created, expires. No role and no status — see `design-decisions.md` section 5. A unique index on `(project_id, lower(email))`, which also serves "every invite for this project" because `project_id` leads |
| `017_add_project_delete_mode.sql` | `deletion_scheduled_at` on `projects`, holding when the project will be removed rather than when deletion began. Both views re-created to exclude anything in a project being deleted, which is how six writers started refusing without being edited. `setTaskDueDate` was meant to be a seventh and was not, because it filtered `tasks` directly — fixed 2026-10-03 |
| `018_add_account_deletion.sql` | `deletion_scheduled_at` on `users`, with the same meaning as on `projects`: when the account will be removed, empty while it is active. Step 4b |
| `019_create_routines.sql` | `routines` — owner, name, the weekdays it is scheduled on as an `integer[]` checked to hold only 1 to 7 — and `completions`, keyed on `(routine_id, done_on)` so a day can be done only once. Both cascade, from the user down. And the view `user_today`, the one place that says what today is for each user. Step 4c |
| `020_check_timezones_and_soft_delete_dates.sql` | Four locks from the step 4c review. `users_timezone_known` calls a new function, `is_known_timezone`, which asks Postgres's own `pg_timezone_names`; and `ended_at` on `memberships`, `deleted_at` on `tasks` and `subtasks`, may no longer be in the future. Adding them validated every existing row, which is why the test tables had to be emptied first |
| `021_index_memberships_project_id.sql` | `memberships_project_id_idx`, a plain index on `project_id`, for `listMembers` and for the cascade when a project is deleted. Step 5. Run on 20,000 memberships: one search and 6 pages instead of reading all 337 |
| `022_add_password_hash.sql` | `password_hash` on `users`: empty means the account cannot log in with a password. `users_password_hash_is_argon2id` insists anything stored starts `$argon2id$`, so a password cannot land as plain text. Step 6 |
| `023_create_sessions.sql` | `sessions`: the SHA-256 hash of a session's token, its user — cascading with the account — when it began and when it ends. `sessions_token_is_hashed` insists on 64 hex characters, so the table never holds a usable token; `sessions_expire_after_created` that it ends after it begins. Step 6 |

Three of them are worth reading for the pattern, not just the columns.

**Corrected 2026-10-03 — `014` carries no stray line.** This page, and the commit message that added the file, used to describe an `update memberships set ended_at = '2020-01-01' where id = 1;` copied into it by mistake. `git log -p` shows the committed file has only ever held its three `alter table` statements, so a fresh clone runs exactly those. Whether a draft with the extra line was ever applied to `taskco_dev` or `taskco_test` cannot be told from here, because `schema_migrations` records only the filename — which is also why an applied migration is never edited: a changed file would never be noticed as different.

**The view — `010`**

```sql
create view visible_tasks as
    select * from tasks
    where deleted_at is null;
```

A named query. It stores no rows; it is worked out from `tasks` each time it is read. Reads go through
it and writes go to the table, so no reading query has to know what "deleted" means. `select *` is
fixed the moment the view is created, so every new column needs `create or replace view` in the same
migration — done in `011` and `013`.

**A required column on a table that may already have rows — `011`**

```sql
alter table tasks
    add column position integer not null default 0;

alter table tasks
    alter column position drop default;
```

The default exists only so existing rows get *some* value. The second statement removes it, so every
new task must be given a position on purpose. Until `createTask` supplied one, every test that created
a task failed with `23502`.

**Blank refused, empty allowed — `013`**

```sql
check (length(trim(notes)) > 0)
```

Refuses `''` and three spaces. Allows `null`, because a `check` only refuses when its answer is
*false*, and for `null` the answer is unknown. It leaves one spelling for "no notes". The same
reasoning is why `tasks_priority_valid` never mentions empty priorities.

**Open** — in `slice-b-review.md`: positions can repeat or go negative; `deleted_at` can precede
`created_at`; titles and notes have no length limit.

## `src/queries.ts` — the slice B functions

Summarised rather than reproduced: they are long, and the file is the source of truth.

| Function | What it does | Reads through | Transaction | Refuses when |
|---|---|---|---|---|
| `createTask({ projectId, title, dueDate? })` | appends at `max(position) + 65536` | — | no | blank title (`23514`), no such project (`23503`) |
| `listTasks({ projectId, userId })` | the project's tasks, in position order | `visible_tasks`, current membership | no | — an outsider gets an empty list |
| `deleteTask(taskId)` | sets `deleted_at`; deleting twice keeps the first time | — | no | — |
| `moveTask({ taskId, afterTaskId?, beforeTaskId? })` | places a task between neighbours, or at either end; renumbers the project when there is no room | `visible_tasks` | yes | task or neighbour missing or deleted; a neighbour in another project; the task named as its own neighbour |
| `setTaskDueDate({ taskId, dueDate })` | sets the date, clears subtask dates past it, returns `{ clearedSubtasks }` | `visible_tasks` | yes | task missing or deleted, or its project being deleted |
| `setTaskNotes({ taskId, notes })` | blank text becomes empty | — | no | — deleted tasks are skipped |
| `createSubtask({ taskId, title, dueDate? })` | appends a subtask within its task | `visible_tasks`, `visible_subtasks` | no | task missing or deleted; 50 already; due after the task |
| `listSubtasks({ taskId, userId })` | the task's subtasks, in position order | both views, current membership | no | — |
| `setSubtaskDueDate({ subtaskId, dueDate })` | `null` clears it to "TBD" | both views | no | subtask or its task deleted; due after the task |
| `setSubtaskNotes({ subtaskId, notes })` | blank text becomes empty | — | no | — deleted subtasks are skipped |
| `refuseDueDateAfterParent(taskId, dueDate)` | the one place the due-date rule is written; not exported | `tasks` | — | a date later than the task's |

**Patterns worth recognising**

- **Reads go through the views; writes go to the tables.** Two reads use `tasks` on purpose: the next
  position and the renumbering, so a deleted task's place is never reused and it comes back where it
  was if restored.
- **Dates compare as text.** `"2026-09-20" > "2026-09-18"` is right because the year comes first and
  every part is zero-padded — which only works because `db.ts` makes dates arrive as text.
- **`count(*)::int`.** `count` produces a `bigint`, which would arrive as a string.
- **`rowCount`** is how an `update` says how many rows it changed. `setTaskDueDate` uses it twice: to
  tell "done" from "not found", and to report how many subtask dates it cleared.
- **The 50-subtask rule and the due-date rule are signs, not locks.** They hold for writes that go
  through these functions, and for nothing else.

**Open** — in `slice-b-review.md`: writes don't yet check who is asking (step 5); two simultaneous
creates can share a position, or both get under the 50; no functions for status or priority yet.

Not in the review:

- `setSubtaskNotes` checks only the subtask's own `deleted_at`, so a subtask whose task was deleted
  still takes new notes. The review counted it as safe because it skips deleted rows — but deleting a
  task marks the task, not its subtasks. The fix for the four writers the review named never reached
  it, and no test covers it.
- Positions only grow at the bottom. A new task, and a task moved to the bottom, both land 65536 past
  the last position, and only a move that finds no room renumbers the list. Around the 32,768th of
  those in one project, with no renumbering in between, the write is refused with `22003`: `position`
  is an `integer`, which stops at 2,147,483,647.
- `setTaskDueDate` clears the dates of soft-deleted subtasks too, and counts them in
  `clearedSubtasks`. Clearing them may be right — a restored subtask should not come back due after
  its task — but the count is what the Lead's confirmation shows, and it would include subtasks the
  Lead cannot see. Nothing soft-deletes a subtask yet, so it cannot happen today.

## `src/queries.ts` — the slice C and step 4b functions

The same summary, for what came after. Every one runs in a transaction unless it is a single
statement, which is atomic for free.

| Function | What it does | Refuses when |
|---|---|---|
| `setTaskAssignee({ taskId, membershipId })` | sets or empties a task's assignee | task missing, deleted, or in a project being deleted; assignee not a current member of the task's project |
| `setSubtaskAssignee({ subtaskId, membershipId })` | the same for a subtask — the project check is code only | the same |
| `createInvite({ projectId, email, invitedByUserId })` | replaces any earlier invite to that address, expires three days out | project being deleted; no account with that address ("No email found"); already a member |
| `acceptInvite({ inviteId, userId })` | makes the recipient an associate and destroys the invite | not theirs, or gone ("invite not found"); expired; project being deleted; already a member |
| `declineInvite({ inviteId, userId })` | destroys the invite | not theirs, or gone |
| `listInvitesForUser(userId)` | the unexpired invites addressed to the user, oldest first | — |
| `deleteProject(projectId)` | delete mode for thirty days; returns `{ scheduledFor }` | not found, or already being deleted |
| `restoreProject(projectId)` | takes a project out of delete mode | not found, past its date, or its Lead's account is being deleted |
| `deleteProjectNow(projectId)` | removes the project and everything under it | not found, or already in delete mode |
| `purgeDeletedProjects()` | removes every project past its date; returns `{ purged }` | — |
| `transferLeadership({ projectId, toUserId, outgoing })` | demotes the Lead, then promotes a member; `"leave"` also ends the old Lead's membership | project being deleted, or not found; recipient not a current member, or already the Lead |
| `deleteAccount(userId)` | thirty days on the account and on every project it still leads; ends its memberships elsewhere | not found, or already being deleted |
| `reopenAccount(userId)` | clears the account's date, and the date on every project it still leads that is inside its window | not found, or past its date |
| `purgeDeletedAccounts()` | removes every account past its date that no longer leads a project; returns `{ purged }` | — |
| `createRoutine({ userId, name, weekdays })` | a routine for its owner, on the given weekdays (1 Monday to 7 Sunday) | blank name; no days; a day outside 1–7 (`23514`) |
| `listRoutines(userId)` | the owner's routines, oldest first, each with `due_today` and `done_today` | — |
| `completeRoutine({ routineId, userId })` | records today, on the owner's calendar, and returns `{ doneOn }`; a second completion that day does nothing | not the owner's routine, or no such routine |
| `undoCompletion({ routineId, userId })` | removes today's completion only | nothing completed today |
| `getStreak({ routineId, userId })` | fetches today, the start day, the weekdays and the log, and hands them to `countStreak` | not the owner's routine, or no such routine |

Three helpers are not exported: `refuseUnlessCurrentMember`, the assignee rule;
`refuseIfProjectIsBeingDeleted`, which takes `for share` so many writers can hold a project row at
once; and `endMembership`, the one way a membership ends, which takes the caller's client so it can
only run inside the caller's transaction.

## The slice B tests — now in `src/test_queries`

When slice B ended there were 53 tests in the file — `users` 1, `projects` 4, `memberships` 5, `tasks` 26, `subtasks` 17 — plus 3 in
`guard.test.ts`, for 56 in all.

```
tasks
  creates a task in a project
  refuses a task with a blank title
  refuses a task in a project that does not exist
  lists a project's tasks, oldest first
  shows nothing to someone who is not a member
  starts a new task as not started, with no priority
  refuses a status that is not on the list
  refuses a priority that is not on the list
  keeps a due date as the calendar day it was given
  leaves the due date empty when none is given
  hides a deleted task from the list
  keeps a deleted task's row, with the time it was deleted
  puts a new task at the end of the list
  spaces positions so there is room between tasks
  moves a task between two others
  makes room when two tasks are next to each other
  moves a task to the top of the list
  moves a task to the bottom of the list
  makes room at the top when the first task sits at 1
  saves notes on a task
  stores blank notes as empty
  refuses blank notes written straight to the table
  refuses to change a deleted task's date, and leaves its subtasks alone
  refuses to move a task next to tasks in another project
  refuses to move a deleted task
  refuses a deleted task as a neighbour
subtasks
  refuses more than 50 subtasks on one task
  refuses a subtask due after its task
  creates a subtask under a task
  lists a task's subtasks in order
  refuses a subtask with a blank title
  hides the subtasks of a deleted task
  allows a subtask due on the same day as its task
  allows any subtask date when the task has none
  changes a subtask's due date
  refuses a changed date that is past its task
  clears a subtask's due date
  clears subtask dates that fall past a task's new date
  keeps subtask dates when a task's date moves later
  keeps subtask dates when a task's date is removed
  saves notes on a subtask
  refuses a subtask under a deleted task
  refuses to change a subtask's date when its task is deleted
```

**Patterns new in slice B**

- **Raw SQL to prove a database rule.** `pool.query("update tasks set status = 'done' ...")`: no
  function can write a bad status, and TypeScript would refuse one anyway, so the test talks to the
  database directly.
- **Reading the table beneath the view.** Tests about deleted rows read `tasks` or `subtasks`
  directly, because the view would hide exactly the row being checked.
- **Setting up the hard case by hand.** "makes room when two tasks are next to each other" writes
  positions 10 and 11 directly instead of making seventeen moves, and creates the tasks in an order
  where the `id` tiebreaker cannot rescue the bug.
- **`toEqual`** compares the contents of two lists; `toBe` would ask whether they are the same list.
- **Refusals from code check `message`; refusals from the database check `code` and `constraint`.**

**Open**

- "lists a project's tasks, oldest first" is ordered by position now, not by age.
- Nothing tests the signs from outside `queries.ts`. Every test goes through the same functions, which
  is exactly what makes a sign look like a lock from inside the suite.

## `src/seed.ts` and `src/preview.ts` — throwaway tools

- **`npm run seed`** empties **taskco_dev** and fills it with a demo: a lead, an associate, one project,
  four tasks (one of them deleted) and two subtasks.
- **`npm run preview`** writes `preview.html` from **taskco_dev** as one user sees it — user 1 by
  default, or `npx tsx src/preview.ts <id>`. It calls the same functions the tests call, so the page
  shows exactly what the app knows. `preview.html` is git-ignored.

Both exist to look at the data before there is a frontend, and are meant to be deleted in step 7.

**Open**

- `seed.ts` sets status and priority with raw SQL, because no function does it yet.
- `preview.ts` fetches subtasks with one query per task — fine for four tasks, not for a real page.

## `src/purge.ts`

**`npm run purge`** calls `purgeDeletedProjects` and then `purgeDeletedAccounts` against
**taskco_dev**, and prints how many of each it removed. A project or account past its deletion date
is already gone from every answer the app gives; the purge only removes the rows. The cascades take
a project's memberships, tasks, subtasks and invites, and an account's memberships, the invites it
sent, and its routines with their completions. Projects go first because the account purge skips
anyone who still leads one.

Unlike `seed.ts` and `preview.ts` it is not throwaway. It is the hand-run trigger until a server, or
the host's scheduler, calls the same function. Reasoning in `design-decisions.md`, section 6.

## `src/streak.ts`

**`countStreak({ today, started, weekdays, doneOn })`** — the five streak rules from
`design-decisions.md` section 9, as a pure function: plain values in, a number out, no database.
It walks back one day at a time from `today` to `started`, skips days the routine is not scheduled
on, adds one for each scheduled day that was done, and stops at the first scheduled day that was
missed — unless that day is today, which is still open.

Dates go in and out as `"2026-10-08"` labels, compared as text. Its two private helpers turn a label
into a UTC moment only to step back a day or read the weekday, then straight back into a label: UTC
has no daylight saving, so a day there is always 24 hours. `getUTCDay` numbers Sunday 0, so
`isoWeekday` makes it 7, to match the routine's numbering.

`getStreak` in `queries.ts` is its only caller. The tests in `streak.test.ts` call it directly, with
fixed October 2026 dates, one test per rule.

**Open** — `weekday-numbering-written-twice`: `isoWeekday` here and `extract(isodow …)` in
`listRoutines` answer the same question in two places.

---

# Step 5 — the HTTP layer

Built on branch `step-5`, 2026-10-10 to 2026-10-22: the first endpoints one at a time by hand, the
rest in one session once Claude began writing the code. Preparation and the questions behind it are
in [`step-5-prep.md`](./step-5-prep.md); the decisions, by name, in `design-decisions.md` section 14.
Express 5.2.1 runs the server; Zod 4.6.5 checks what a request carries; Supertest 7.2.2 lets a test
send it requests without starting it. Code blocks in this section are a snapshot of 2026-10-22,
taken before step 6 replaced the `X-User-Id` header with a session — see step 6 for what changed.

## The endpoints

**Every endpoint** answers 401 without a live session (until step 6, without a usable `X-User-Id`); 404 for an id in the path that cannot be
an id; 404 when the asker cannot see the project; 403 when an Associate calls a Lead's endpoint; and
400 for a body Zod refuses, including one carrying a field it did not ask for. The column on the
right lists the refusals from `queries.ts`, which answer 409 with their reason unless marked 404.

| Method and path | Who may | Calls | Answers | Refused with |
|---|---|---|---|---|
| `GET /projects` | anyone | `listProjectsForUser` | 200 `{ projects }`, each with the asker's `role` | — |
| `POST /projects` | anyone, who becomes its Lead | `createProject` | 201 `{ project }` | — |
| `POST /projects/:projectId/deletion` | the Lead | `deleteProject` | 201 `{ scheduledFor }` | already being deleted |
| `DELETE /projects/:projectId/deletion` | the Lead | `restoreProject` | 204 | not being deleted; past its date; the Lead's account is going |
| `DELETE /projects/:projectId` | the Lead | `deleteProjectNow` | 204 | already in delete mode |
| `GET /projects/:projectId/members` | any member | `listMembers` | 200 `{ members }` | — |
| `DELETE /projects/:projectId/members/:userId` | the Lead, or the member themself | `removeMember` | 204 | removing the Lead; project being deleted; 404 not a member |
| `POST /projects/:projectId/transfer` | the Lead | `transferLeadership` | 204 | not a current member; account being deleted; already the Lead; project being deleted |
| `GET /invites` | anyone | `listInvitesForUser` | 200 `{ invites }`, those addressed to the asker | — |
| `POST /projects/:projectId/invites` | the Lead | `createInvite` | 201 `{ invite }` | "No email found"; already a member; project being deleted |
| `POST /invites/:inviteId/accept` | its recipient | `acceptInvite` | 200 `{ projectId }` | expired; already a member; project being deleted; 404 not theirs |
| `DELETE /invites/:inviteId` | its recipient | `declineInvite` | 204 | 404 not theirs |
| `GET /projects/:projectId/tasks` | any member | `listTasks` | 200 `{ tasks }` | — |
| `POST /projects/:projectId/tasks` | the Lead | `createTask` | 201 `{ task }` | project being deleted |
| `PUT /tasks/:taskId/status` | any member | `setTaskStatus` | 204 | — |
| `PUT /tasks/:taskId/priority` | the Lead | `setTaskPriority` | 204 | — |
| `PUT /tasks/:taskId/notes` | any member | `setTaskNotes` | 204 | — |
| `PUT /tasks/:taskId/due-date` | the Lead | `setTaskDueDate` | 200 `{ clearedSubtasks }` | — |
| `PUT /tasks/:taskId/assignee` | the Lead | `setTaskAssignee` | 204 | not a current member of the project |
| `PUT /tasks/:taskId/position` | the Lead | `moveTask` | 204 | a neighbour not found, or in another project; the task named as its own neighbour |
| `DELETE /tasks/:taskId` | the Lead | `deleteTask` | 204 | — |
| `GET /tasks/:taskId/subtasks` | any member | `listSubtasks` | 200 `{ subtasks }` | — |
| `POST /tasks/:taskId/subtasks` | the Lead | `createSubtask` | 201 `{ subtask }` | due after its task; fifty already |
| `PUT /subtasks/:subtaskId/status` | any member | `setSubtaskStatus` | 204 | — |
| `PUT /subtasks/:subtaskId/priority` | the Lead | `setSubtaskPriority` | 204 | — |
| `PUT /subtasks/:subtaskId/notes` | any member | `setSubtaskNotes` | 204 | — |
| `PUT /subtasks/:subtaskId/due-date` | the Lead | `setSubtaskDueDate` | 204 | due after its task |
| `PUT /subtasks/:subtaskId/assignee` | the Lead | `setSubtaskAssignee` | 204 | not a current member of the project |
| `DELETE /subtasks/:subtaskId` | the Lead | `deleteSubtask` | 204 | — |
| `GET /routines` | anyone | `listRoutines` | 200 `{ routines }`, the asker's own | — |
| `POST /routines` | anyone | `createRoutine` | 201 `{ routine }` | — |
| `PUT /routines/:routineId/completions/today` | its owner | `completeRoutine` | 200 `{ doneOn }` | 404 not theirs |
| `DELETE /routines/:routineId/completions/today` | its owner | `undoCompletion` | 204 | nothing done today |
| `GET /routines/:routineId/streak` | its owner | `getStreak` | 200 `{ streak }` | 404 not theirs |
| `POST /account/deletion` | the asker, for themself | `deleteAccount` | 201 `{ scheduledFor }` | already being deleted |
| ~~`DELETE /account/deletion`~~ | — | — | — | *Removed in step 6:* an account being deleted has no session that counts, so this was unreachable. Logging in reopens it |

**What each body holds.** Every body is a `z.strictObject`, so these keys and no others.

| Endpoints | Body |
|---|---|
| `POST /projects` | `{ name }` — text, trimmed, not blank |
| `POST /routines` | `{ name, weekdays }` — weekdays a list of at least one whole number from 1 to 7 |
| `POST /projects/:projectId/tasks`, `POST /tasks/:taskId/subtasks` | `{ title, dueDate? }` — the date a real calendar day, `"2026-11-20"` |
| `PUT …/status` | `{ status }` — `not_started`, `in_progress`, `on_hold` or `completed` |
| `PUT …/priority` | `{ priority }` — `low`, `med`, `high`, or `null` for "Not set" |
| `PUT …/notes` | `{ notes }` — text, or `null`; blank is stored as empty |
| `PUT …/due-date` | `{ dueDate }` — a calendar day, or `null` for "TBD" |
| `PUT …/assignee` | `{ membershipId }` — an id from the members list, or `null` for nobody |
| `PUT /tasks/:taskId/position` | `{ afterTaskId?, beforeTaskId? }` — at least one |
| `POST /projects/:projectId/transfer` | `{ toUserId, outgoing }` — `outgoing` is `stay` or `leave` |
| `POST /projects/:projectId/invites` | `{ email }` — an address, at most 254 characters |

## `src/app.ts`

**What it does.** Builds the server and exports it, without starting it — `server.ts` starts it, and
the tests use it unstarted. The file reads top to bottom in sections, like `queries.ts`: the setup;
"who is asking, and may they"; then projects, members, invites, tasks, subtasks, routines and the
account; then the 404 and the error handler. Express tries things in the order they were added, so
the order of the file is part of the logic.

### The setup

```ts
declare global {
    namespace Express {
        interface Locals {
            userId: string;
            project: ProjectForUser;
        }
    }
}

const idPattern = /^[1-9][0-9]{0,17}$/;
const id = z.string().regex(idPattern);

export const app = express();

app.disable("x-powered-by");
app.use(express.json());
```

**`declare global`** tells TypeScript what `res.locals` holds. Without it, `res.locals.userId` is
`any`, and `const n: number = res.locals.userId` passes the type check without a word — tried while
preparing the step. `project` is set only by `requireMember` and `requireLead`, so only a route that
names one of them may read it.

**`idPattern`** accepts `1` to eighteen digits and refuses `abc`, `007` and `-1`, which would
otherwise reach Postgres as `22P02`. **`id`** is the same rule for an id sent in a body.

**`app.disable("x-powered-by")`** stops Express adding `X-Powered-By: Express` to every response.

**`app.use(express.json())` reads the body.** It turns the JSON text a request carries into an object
on `req.body` — but only when the request says `Content-Type: application/json`. Otherwise, or with
no body at all, `req.body` is `undefined`, and Zod refuses it.

### Who is asking, and may they

*Replaced in step 6:* the first block below read `X-User-Id`. It now reads the session cookie — the
same shape, with a different inside, as the placeholder was built to allow. The rest is unchanged.

```ts
app.use((req, res, next) => {
    const userId = req.get("X-User-Id");

    if (!userId || !idPattern.test(userId)) {
        res.status(401).json({ error: "Say who is asking" });
        return;
    }

    res.locals.userId = userId;
    next();
});

for (const name of ["projectId", "taskId", "subtaskId", "userId", "inviteId", "routineId"]) {
    app.param(name, (req, res, next, value) => {
        if (!idPattern.test(value)) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        next();
    });
}

type PathIds = { projectId?: string; taskId?: string; subtaskId?: string };

async function projectIdOf(params: PathIds): Promise<string | undefined> {
    if (params.projectId) return params.projectId;
    if (params.taskId) return findTaskProject(params.taskId);
    if (params.subtaskId) return findSubtaskProject(params.subtaskId);
    return undefined;
}

async function projectFor(params: PathIds, userId: string): Promise<ProjectForUser | undefined> {
    const projectId = await projectIdOf(params);
    const projects = await listProjectsForUser(userId);
    return projects.find((p) => p.id === projectId);
}

async function requireLead<P extends PathIds>(req: Request<P>, res: Response, next: NextFunction): Promise<void> {
    const project = await projectFor(req.params, res.locals.userId);

    if (!project) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    if (project.role !== "lead") {
        res.status(403).json({ error: "Only the project's Lead can do that" });
        return;
    }

    res.locals.project = project;
    next();
}
```

**The first `app.use(...)` is "who is asking"**, and runs before every route. No `X-User-Id` header,
or one that is not an id → 401, and `return` stops there. Otherwise it stores the id on `res.locals`
and `next()` hands the request on. **The header is a stand-in for login.** It breaks section 13's
rule — identity never comes from the request — on purpose, in one place, until step 6 replaces that
one function with a session. Every route reads `res.locals.userId`; none reads the header.

**`app.param`** runs before any route whose path names that id. An id that cannot be one names
nothing, so it is 404 — before `abc` can reach Postgres as an error and come back as a 500. Tried:
with no `app.param`, `DELETE /projects/1/members/abc` answered 500.

**`projectFor` is "may they?"** It finds the project the request is about — named in the path, or
found through the task or subtask the path names — and looks for it in the asker's own project list.
So who can see a project is written once, in `listProjectsForUser`, and the role comes with it. A
task's project is never taken from the path, so a request cannot pass the check for one project
while acting on a task in another.

**`requireMember` and `requireLead`** are named on the line of every route that touches a project.
`requireMember` answers 404 to someone who cannot see the project — the same answer as a project that
does not exist. `requireLead` adds 403 for an Associate, who can already see the project. They are
generic functions, not `RequestHandler`s: typed as plain middleware they made Express forget the
types of the route's own path, and `req.params.userId` became `string | string[] | undefined`.

**A route that forgets its check fails closed.** Tried: with `requireLead` removed from
`POST /projects/:projectId/tasks`, every access test went red — the handler read
`res.locals.project`, which nothing had set, and crashed with a 500 rather than letting anyone in.

### A route

```ts
const newTask = z.strictObject({
    title: z.string().trim().min(1),
    dueDate: z.iso.date().optional(),
});

app.post("/projects/:projectId/tasks", requireLead, async (req, res) => {
    const body = newTask.safeParse(req.body);

    if (!body.success) {
        res.status(400).json({ error: "The request body is not valid", issues: body.error.issues });
        return;
    }

    const task = await createTask({
        projectId: res.locals.project.id,
        title: body.data.title,
        dueDate: body.data.dueDate,
    });
    res.status(201).json({ task });
});
```

Every route has this shape, with less in it when there is no body: the check named on its line, the
body checked, the query, the answer. `safeParse` never throws; it returns `success: true` with the
cleaned `data`, or `success: false` with `issues` saying what was wrong.

**`strictObject`, not `object`**: a body carrying a field the server did not ask for — `userId`, a
`projectId` beside a path that names one — is refused rather than quietly stripped. The client sends
intent; a client that tries to send a fact has a bug, and hears about it at once.

**`z.iso.date()` knows the calendar.** It refuses `2026-02-30`. Tried: with `z.string()` in its place,
`2026-02-30` reached Postgres as `22008` and answered 500.

**The order is who, may they, the body, then the query.** An Associate sending a blank title hears
403, not 400. Tried: with the body checked before the role, only the test "answers 403 to an
Associate before looking at the body" went red.

**No route needs a `try`.** Express 5 passes a rejected `await` to the error handler by itself.

### Not found, and errors

```ts
app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

const handleErrors: ErrorRequestHandler = (error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        res.status(400).json({ error: "The request body is not valid JSON" });
        return;
    }

    if (error.type === "entity.too.large") {
        res.status(413).json({ error: "The request body is too large" });
        return;
    }

    if (error instanceof NotFound) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    if (error instanceof Refused) {
        res.status(409).json({ error: error.message.replace(/^\w+: /, "") });
        return;
    }

    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
};

app.use(handleErrors);
```

**The last two `app.use(...)` calls make every answer JSON.** "Not found" is reached only when no
route answered, so **every new route goes above it**; anything below is never reached. That happened
three times while `GET /projects/:projectId/tasks` was typed by hand, each time as
`expected 404 to be 200`.

**`handleErrors` catches whatever a route throws.** Express recognises it **only because it has four
parameters**: `next` is never used and has to be there — and TypeScript cannot see that rule. Broken
JSON and a body over 100 kB are the asker's mistakes, 400 and 413. A `NotFound` from `queries.ts` is
404, in the same words as a path that does not exist. A `Refused` is 409, with its message minus the
name of the function that refused: `"createSubtask: a task can have at most 50 subtasks"` reaches the
asker as `"a task can have at most 50 subtasks"`. Anything else is ours: the whole error goes to the
terminal, and the asker gets 500 and one sentence — no stack, no table or constraint names.

**Open** — the items live in [`open-items.md`](./open-items.md), under "The HTTP layer":
`stub-identity-trusts-any-id`, `races-answer-500`, `refusal-reasons-are-developer-sentences`,
`access-check-reads-whole-project-list`, `check-then-act-in-the-http-layer` and
`move-refusals-reveal-other-tasks`.

## `src/errors.ts`

```ts
export class NotFound extends Error {
    name = "NotFound";
}

export class Refused extends Error {
    name = "Refused";
}
```

**What it does.** Gives a refusal a kind, so the error handler can choose a status without reading
the sentence. **`NotFound`** is for what was named and does not exist for the asker; **`Refused`**
for what exists, when a rule says no. Both extend `Error`, so `message` is unchanged and every test
that matches one still holds. `name` is what the terminal prints in front of the message.

`queries.ts` throws fifteen `NotFound`s and twenty-two `Refused`s. The six "the insert returned no
row" errors stay plain `Error`s: they cannot happen, and if one does, it is ours and a 500.

## `src/queries.ts` — the step 5 functions

| Function | What it does | Refuses when |
|---|---|---|
| `listProjectsForUser(userId)` | *changed:* each project now carries the asker's `role` in it, typed `ProjectForUser` | — |
| `listMembers({ projectId, userId })` | the project's current members, the Lead first: `membership_id`, `user_id`, `email`, `role`, `joined_at`. Nothing for someone who is not a current member | — |
| `setTaskStatus({ taskId, status })` | through `visible_tasks`, like `setTaskNotes` | task deleted, missing, or in a project being deleted (`NotFound`) |
| `setTaskPriority({ taskId, priority })` | `null` is "Not set" | the same |
| `findTaskProject(taskId)` | the project a visible task is in, or `undefined` | — |
| `setSubtaskStatus({ subtaskId, status })` | through `visible_subtasks` *and* `visible_tasks`, so a subtask under a deleted task cannot change | subtask or its task deleted, or missing (`NotFound`) |
| `setSubtaskPriority({ subtaskId, priority })` | the same, for priority | the same |
| `deleteSubtask(subtaskId)` | sets `deleted_at`; the first thing ever to | the same |
| `findSubtaskProject(subtaskId)` | the project a visible subtask's visible task is in, or `undefined` | — |

## `src/server.ts`

```ts
import "dotenv/config";
import { app } from "./app.js";

const port = 3000;

app.listen(port, "127.0.0.1", () => {
    console.log(`Taskco is listening on http://127.0.0.1:${port}`);
});
```

**What it does.** Loads `.env`, then starts the app. `dotenv/config` is the first import for step 1's
reason: `db.ts` reads `DATABASE_URL` the moment it is imported. `127.0.0.1` means only this machine
can reach it — which matters while anyone can claim to be anyone with a header.

## The HTTP tests — `src/test_http`

| File | Tests | Covers |
|---|---|---|
| `projects.test.ts` | 20 | `GET` and `POST /projects`, delete mode and undo, delete now |
| `members.test.ts` | 18 | the member list, removing and leaving, transfer |
| `invites.test.ts` | 19 | the asker's invites, sending, accepting, declining |
| `tasks.test.ts` | 26 | a project's tasks, creating one, moving, deleting |
| `task-fields.test.ts` | 29 | a task's status, priority, notes, due date and assignee |
| `subtasks.test.ts` | 35 | a task's subtasks, creating one, every subtask field, deleting |
| `routines.test.ts` | 20 | the asker's routines, creating, completing and undoing today, the streak |
| `account.test.ts` | 6 | deleting and reopening the asker's own account |
| `errors.test.ts` | 4 | a path that does not exist, broken JSON, a body too large, a crash |

177 HTTP tests and 170 query tests: 347 in eighteen files, passing in file order and shuffled.

`request(app).put(...).set("X-User-Id", ana.id).send({ ... })` sends a request to the app without
starting a server. The same `setup.ts` empties the tables first. Users are made with `createUser`
directly; there is no endpoint for them until step 6.

**One picture per file.** `task-fields.test.ts` and `subtasks.test.ts` start every test from the same
`website()`: Ana leads Website, Ben is an Associate in it, Cara is not in it, and there is one task
(and one subtask). The other files set up each test in full, as the query tests do. Setup goes through
the query functions, never through the endpoint the test is about.

**Every refusal test also checks nothing changed** — after the 403, the priority is still empty;
after the 404, the task is still not started. A refusal that saved the change anyway would be worse
than no refusal.

**Each describe ends with the 401 test**, because every endpoint is behind "who is asking". A 401 test
passes before its route exists: the request is turned away before Express looks for a route.

**Tests that pass first are broken on purpose.** Tried, each one going red as named:

- With no route at all, both 404 tests for tasks passed — "Not found" answered them. Once the route
  was reachable, removing its check turned them red: Cara **created a task in Ana's project**,
  `expected 201 to be 404`, and project 99 crashed on its foreign key, `expected 500 to be 404`.
- With `.some` in place of the role check, an Associate created a task: `expected 201 to be 403`.
- With the "only yourself" rule removed, Ben removed Cara: `expected 204 to be 403`.
- With the `Refused` mapping removed, the 409 tests got 500; with the `NotFound` mapping removed, an
  invite addressed to someone else crashed rather than answering 404.
- With `listMembers`'s check on the asker removed, Cara saw Ana's members.
- With `requireMember` removed from `PUT /tasks/:taskId/status`, Cara changed the task.

From the first endpoints, still true:

- **"shows nobody else's projects" is the one that proves the id is used.** Ids restart at 1 before
  every test, so Ana is always user 1, and a route that asked for user `"1"` would pass the first
  test. Changing the route to `listProjectsForUser("1")` turns this one red.
- **Two tests, asking as two different people, each catch what the other cannot.** With
  `listInvitesForUser("2")` in the route, the test asking as Ben still passed; only the one asking as
  Ana, the sender, went red.
- **Refusal tests can pass for the wrong reason.** With `app.use(express.json())` deleted, every body
  looked empty and every `POST` was refused: "creates a project" went red with `expected 400 to be
  201`, while both refusal tests stayed green. Only the test where the answer is *yes* noticed.
- **When Zod misses, the database still refuses — but the answer is wrong.** With the last `.min(1)`
  removed from `weekdays`, `[]` reached `createRoutine` and `routines_weekdays_valid` refused it, so
  no row was saved, but the asker got a 500. The lock kept the data right; only Zod and the error
  handler can make the answer right.
- **TypeScript cannot see the four-parameter rule.** With `next` removed, `npm run typecheck` passed,
  and only the tests went red.
- **Some mistakes only reading finds.** The "Not found" block was once typed twice. Every test passed,
  because the second copy could never be reached.

---

# Step 6 — Authentication

Built 2026-10-22 on branch `step-5`, in seven commits. The decisions — session cookies, Argon2id
from `node:crypto`, and logging in reopens an account being deleted — are in `design-decisions.md`
section 15. Code blocks in this section are a snapshot of 2026-10-22.

## The endpoints

| Method and path | Who may | Calls | Answers | Refused with |
|---|---|---|---|---|
| `POST /users` | anyone, without a session | `registerUser`, `createSession` | 201 `{ user }`, and the session cookie | 409 email taken; 409 unknown timezone; 400 a body Zod refuses |
| `POST /sessions` | anyone, without a session | `logIn` | 201 `{ user }`, and the session cookie | 401 "The email or password is wrong"; 400 a body Zod refuses |
| `DELETE /sessions/current` | the asker | `endSession` | 204, and the cookie emptied | — |
| `GET /account` | the asker | `getUser` | 200 `{ user }` | — |

| Endpoint | Body |
|---|---|
| `POST /users` | `{ email, password, timezone }` — an address of at most 254 characters, a password of 8 to 128, and a timezone name the browser reports |
| `POST /sessions` | `{ email, password }` — any text: whatever does not match an account is the same wrong answer |

## `src/app.ts` — logging in, and who is asking

```ts
const sessionCookie = "taskco_session";

const sessionCookieOptions = { httpOnly: true, secure: true, sameSite: "strict", path: "/" } as const;

function setSessionCookie(res: Response, token: string): void {
    res.cookie(sessionCookie, token, { ...sessionCookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function readCookie(req: Request, name: string): string | undefined {
    for (const pair of (req.get("Cookie") ?? "").split(";")) {
        const [key, ...value] = pair.trim().split("=");
        if (key === name) return value.join("=");
    }
    return undefined;
}

app.post("/sessions", async (req, res) => {
    const body = credentials.safeParse(req.body);

    if (!body.success) {
        res.status(400).json({ error: "The request body is not valid", issues: body.error.issues });
        return;
    }

    const session = await logIn(body.data);

    if (!session) {
        res.status(401).json({ error: "The email or password is wrong" });
        return;
    }

    setSessionCookie(res, session.token);
    res.status(201).json({ user: session.user });
});

app.use(async (req, res, next) => {
    const token = readCookie(req, sessionCookie);
    const userId = token ? await findSessionUser(token) : undefined;

    if (!token || !userId) {
        res.status(401).json({ error: "Log in first" });
        return;
    }

    res.locals.userId = userId;
    res.locals.sessionToken = token;
    next();
});
```

**What it does.** `POST /users` and `POST /sessions` come first, in a section of their own called
"LOGGING IN". They sit above "who is asking", which is all it takes to make them public: Express
runs things in the order they were added, and a route above the check never passes through it.
`POST /users` is the same shape as `POST /sessions`, and logs the new account in at once.

**The cookie's three flags.** `httpOnly`: page scripts cannot read it, so a script injected into a
page cannot steal it. `secure`: it travels only over HTTPS — and to `localhost` and `127.0.0.1`,
which browsers and `curl` treat as secure; tried with `curl` against a running server, in bash and
in PowerShell. `sameSite: "strict"`: a request another site starts never carries it, which is the
defence against cross-site request forgery. `maxAge` gives the cookie the session's own thirty days.

**`readCookie`** finds one cookie in the `Cookie` header, which holds them all, separated by `;`. A
token is base64url, so it needs no decoding — and so no package to parse cookies.

**"Who is asking"** is the same middleware as in step 5, with a different inside: it hashes the
token the cookie carries and asks `findSessionUser` for a live session. No route changed. It now
also keeps the token on `res.locals.sessionToken`, for logging out.

**Logging out** is `DELETE /sessions/current`: `endSession` deletes the one session, and
`res.clearCookie` tells the browser to forget the cookie, with the same flags it was set with.

**Open** — in [`open-items.md`](./open-items.md), under "Authentication": `login-not-rate-limited`,
`registration-reveals-accounts`, `no-password-change-or-reset`, `email-not-verified`,
`accounts-without-a-password`, `secure-cookie-needs-a-secure-origin`, `sessions-end-after-thirty-days`
and `reopen-and-session-are-two-steps`.

## `src/passwords.ts`

```ts
const current: Settings = { memory: 19456, passes: 2, parallelism: 1 };

export async function hashPassword(password: string, settings: Settings = current): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, settings, 32);
    const { memory, passes, parallelism } = settings;
    return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${encode(salt)}$${encode(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = phc.exec(stored);

    if (!parts) {
        throw new Error("verifyPassword: the stored string is not an Argon2id hash");
    }

    const [, memory, passes, parallelism, salt, hash] = parts;
    const expected = Buffer.from(hash!, "base64");
    const settings = { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) };
    const actual = await derive(password, Buffer.from(salt!, "base64"), settings, expected.length);

    return timingSafeEqual(actual, expected);
}
```

**What it does.** Turns a password into a string that holds everything needed to check it again:
the algorithm, the settings, a random salt, and the hash. `derive` wraps `node:crypto`'s `argon2`,
which takes a callback, in a promise. The settings are OWASP's minimum for Argon2id — 19 MiB, two
passes, one lane — and cost about 40 ms.

**`verifyPassword` uses the settings stored with the hash, not today's.** Tried: with `current` in
their place, the test that checks a hash made with weaker settings went red. That is what lets the
settings rise later without locking anyone out.

**`timingSafeEqual`** compares every byte however early the first difference is, so the time a
comparison takes says nothing about how close a guess was.

**`hashForNobody`** makes one hash of a random password, once, the first time it is asked. `logIn`
checks against it when the email matches no account, so that answer takes as long as a real one.

**`@types/node` is 24.13.6.** Node 24.7 added `argon2`; the types for Node 22 did not have it, and the
code runs on Node 24.14.

**Open** — nothing beyond the authentication items above.

## `src/queries.ts` — the step 6 functions

| Function | What it does | Refuses when |
|---|---|---|
| `registerUser({ email, password, timezone })` | an account with an Argon2id hash of its password | an account already uses that email, in any case; a timezone Postgres does not know — both `Refused`, turned from the database's own refusal |
| `getUser(userId)` | the account, without its hash | no such account (`NotFound`) |
| `createSession(userId)` | a random 32-byte token, base64url; stores its SHA-256 and returns the token; thirty days | — |
| `logIn({ email, password })` | finds the email lowered, checks the password, reopens an account being deleted, and returns `{ token, user }` | returns `undefined` — not a throw — for a wrong password, an unknown email, an account with no password, or one past its date |
| `findSessionUser(token)` | the account a live session belongs to, or `undefined`: not ended, not past its end, and not an account being deleted | — |
| `endSession(token)` | deletes that one session | — |
| `purgeExpiredSessions()` | deletes every session past its end; returns `{ purged }`. `npm run purge` runs it last | — |
| `deleteAccount(userId)` | *changed:* also deletes every session of the account, in the same transaction | as before |
| `createUser(email, timezone)` | *changed:* names its columns, so no row of `users` leaves the file with `password_hash` | as before |

**`logIn` returns `undefined` rather than throwing.** The route must answer 401 for a failed login,
which neither error kind means; and the caller cannot ignore the answer, because without it there is
no token to put in a cookie.

**Deleting an account ends its sessions.** Tried before the fix: Ana deleted her account, logged in
again to reopen it, and a session from before the deletion — "a lost laptop" — counted again:
`expected '1' to be undefined`.

## `src/testing/session.ts`

```ts
export async function cookieFor(user: { id: string }): Promise<string> {
    return `taskco_session=${await createSession(user.id)}`;
}
```

Every HTTP test that asks as someone sends `.set("Cookie", await cookieFor(ana))`. It makes the
session directly rather than logging in through `POST /sessions`, which would cost an Argon2 hash in
every test. The tests for logging in itself use `registerUser` and the real endpoints.

## The tests

`src/test_http/sessions.test.ts`, 21 tests: who is asking, registering, logging in, logging out, and
who am I. `src/test_queries/8_sessions.test.ts`, 17, and `passwords.test.ts`, 6, for the layer
beneath. Five more in `1_users.test.ts`, for registering and finding an account. **394 tests in
twenty-one files**, passing in file order and shuffled.

**The crash test changed.** It used to ask as user `"99"`, who did not exist, and let
`createProject` fail on a foreign key. Only the `X-User-Id` placeholder made that possible: a real
session cannot belong to nobody. It now builds a one-route app that throws, in front of the real
`handleErrors`, which `app.ts` exports for it.

**Three rules were removed for one run each**, and their tests went red: the lowering in `logIn`'s
lookup, the expiry in `findSessionUser`, and its check that the account is not being deleted.

---

# After steps 5 and 6 — review fixes

The three items [`step-5-review.md`](./step-5-review.md) marked for fixing before merging, and a
fourth that lives in the same route, built test-first on branch `step-5` on 2026-10-24: each test was
seen failing for the reason it names before the change that made it pass. Four commits, nine new
tests. **403 tests in twenty-one files.**

## `logIn` — two logins at once

```ts
if (found.being_deleted) {
    try {
        await reopenAccount(found.id);
    } catch (error) {
        const open = error instanceof Refused && (await getUser(found.id)).deletion_scheduled_at === null;
        if (!open) {
            throw error;
        }
    }
}
```

**What it does.** Two logins at once both read the account as being deleted, and both call
`reopenAccount`. The second finds nothing left to reopen, and refuses. If the account is open by
then, the refusal is about work already done, and the login goes on; if it is still not open, the
refusal stands. Closes `racing-logins-answer-409`.

**The test opens two connections first.** Its first version started a login, then reopened the
account from the test while the login checked its password. It went red — but the stack showed the
*test's* `reopenAccount` refusing, not the login's. The test had waited for a new connection, which
Postgres on Windows is slow to open, and the login had got there first. The second version runs two
logins at once after `await Promise.all([pool.query("select 1"), pool.query("select 1")])`. Without
the fix it fails inside `logIn`, three runs in three. Without that line it passes with or without
the fix: the second login waits for a connection and arrives after the reopening. That one line is
what makes the test watch anything.

## `replaceSessionCookie` — the session a login replaces

```ts
async function replaceSessionCookie(req: Request, res: Response, token: string): Promise<void> {
    const replaced = readCookie(req, sessionCookie);

    if (replaced) {
        await endSession(replaced);
    }

    res.cookie(sessionCookie, token, { ...sessionCookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
}
```

**What it does.** Takes the place of `setSessionCookie` in `POST /users` and `POST /sessions`. A
browser keeps one cookie of this name, so the session a request arrived with can never be sent from
that browser again. It ends here rather than living out its thirty days for whoever else holds the
token. It runs only once the login or registration has succeeded, so a wrong password leaves the
session alone. That test passed from the start, and went red — `expected 401 to be 200` — with the
session ended before the password was checked. Closes `login-leaves-the-replaced-session-alive`.

## `handleErrors` — an error that carries its own 4xx

```ts
if (typeof error.status === "number" && error.status >= 400 && error.status < 500) {
    res.status(error.status).json({ error: "The request cannot be read" });
    return;
}
```

**What it does.** Sits after the two parser refusals that have sentences of their own. `express.json()`
refuses a character set or a content encoding it cannot read with 415, and Express refuses a path
whose escape it cannot decode — `/projects/%zz/tasks` — with 400. Each error carries its status, and
each was answered 500 and logged as the server's own failure. The path case was not in the review: it
turned up while checking whether the parser's were the only ones. Closes `parser-refusals-answer-500`.
`races-answer-500` stays open, because a database's refusal carries a code, not a status.

## `moveTask` — a task as its own neighbour

Refuses an `afterTaskId` or a `beforeTaskId` equal to the task's own id, with `Refused`: "a task
cannot be its own neighbour", 409 over HTTP. It lives in `moveTask` rather than in the route's schema,
so it holds for anything that calls it. It is checked after "task not found", so a task that does not
exist is still 404. Closes `move-accepts-the-task-as-its-own-neighbour`.

## The tests

| File | New | What they say |
|---|---|---|
| `8_sessions.test.ts` | 1 | two logins at once into an account being deleted both get in |
| `sessions.test.ts` | 3 | logging in and registering end the session they replace; a wrong password does not |
| `errors.test.ts` | 3 | an unreadable character set and content encoding are 415, an undecodable path escape 400 |
| `4_tasks.test.ts` | 1 | a task as its own neighbour, on either side, is refused and nothing moves |
| `tasks.test.ts` | 1 | the same over HTTP: 409, and the order is unchanged |

---

# Appendix — current schema

What the tables look like *now*. The migrations are a history; this is their sum. The same tables
drawn as a diagram: [`schema-diagram.md`](./schema-diagram.md).

Two databases, both owned by `taskco_app`, a role with no privileges beyond login.
**taskco_dev** is development; **taskco_test** is wiped before every single test.

### `users`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `email` | text | not null, non-blank, unique on `lower(email)` |
| `timezone` | text | not null, non-blank, a name Postgres knows exactly — `Europe/Zagreb`, not `europe/zagreb` (`users_timezone_known`) |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `deletion_scheduled_at` | timestamptz | nullable — **empty means active**; otherwise when the account will be removed |
| `password_hash` | text | nullable — **empty means it cannot log in**; otherwise an Argon2id hash in PHC form, starting `$argon2id$` (`users_password_hash_is_argon2id`) |

### `projects`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `name` | text | not null, non-blank |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `deletion_scheduled_at` | timestamptz | nullable — **empty means not being deleted**; past it, the project is gone |

### `memberships`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `user_id` | bigint | not null, → `users(id)`, on delete cascade |
| `project_id` | bigint | not null, → `projects(id)`, on delete cascade |
| `role` | text | not null, `'lead'` or `'associate'` |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `ended_at` | timestamptz | nullable — **null means still a member**; not before `created_at`, not in the future |

Indexes: `memberships_user_id_idx` on `(user_id)`; `memberships_project_id_idx` on `(project_id)`,
since migration `021`; `memberships_one_active_idx`, unique, on
`(user_id, project_id) where ended_at is null`; `memberships_one_lead_idx`, unique, on
`(project_id) where role = 'lead' and ended_at is null`. Constraint `memberships_id_project_key`,
unique on `(id, project_id)` — redundant as a rule, and there only so the task assignee's composite
foreign key has something to point at.

### `tasks`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `project_id` | bigint | not null, → `projects(id)`, on delete cascade |
| `title` | text | not null, non-blank |
| `status` | text | not null, defaults to `'not_started'`; one of `not_started`, `in_progress`, `on_hold`, `completed` |
| `priority` | text | nullable — **empty means nobody has decided**; one of `low`, `med`, `high` |
| `due_date` | date | nullable — **empty shows as "TBD"** |
| `notes` | text | nullable, non-blank |
| `position` | integer | not null |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `deleted_at` | timestamptz | nullable — **empty means not deleted**; not before `created_at`, not in the future |
| `assignee_membership_id` | bigint | nullable — **empty means nobody**; `(assignee_membership_id, project_id)` → `memberships(id, project_id)`, on delete set null for the assignee only |

Index: `tasks_project_id_idx` on `(project_id)`.

### `subtasks`

The same columns and rules as `tasks`, with **`task_id`** bigint, not null, → `tasks(id)`, on delete
cascade, in place of `project_id`. Index: `subtasks_task_id_idx` on `(task_id)`.

Its `assignee_membership_id` is a plain reference → `memberships(id)`, on delete set null. A subtask
has no `project_id` to pair with, so "in the task's project" is checked in code only.

Nothing references `subtasks`, which is what keeps nesting to one level.

### `invites`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `project_id` | bigint | not null, → `projects(id)`, on delete cascade |
| `email` | text | not null, non-blank; stored as typed, compared lowered |
| `invited_by_user_id` | bigint | not null, → `users(id)`, on delete cascade |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `expires_at` | timestamptz | not null, after `created_at` |

Index: `invites_one_per_project_email_idx`, unique, on `(project_id, lower(email))`. No role and no
status column: a row existing is the invite pending.

### `routines`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `user_id` | bigint | not null, → `users(id)`, on delete cascade |
| `name` | text | not null, non-blank |
| `weekdays` | integer[] | not null; at least one day, and only 1 (Monday) to 7 (Sunday) |
| `created_at` | timestamptz | not null, defaults to `now()`; on the owner's calendar, it is the day a streak can start |

Index: `routines_user_id_idx` on `(user_id)`.

### `completions`

| Column | Type | Rules |
|---|---|---|
| `routine_id` | bigint | not null, → `routines(id)`, on delete cascade |
| `done_on` | date | not null — the owner's calendar day, set by the server |
| `created_at` | timestamptz | not null, defaults to `now()` |

Primary key `(routine_id, done_on)`, and no `id`: the pair is the row's identity, and it is what
makes a day impossible to record twice.

### `sessions`

| Column | Type | Rules |
|---|---|---|
| `token_hash` | text | primary key; 64 hex characters, the SHA-256 of the token in the cookie (`sessions_token_is_hashed`) |
| `user_id` | bigint | not null, → `users(id)`, on delete cascade |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `expires_at` | timestamptz | not null, after `created_at`; thirty days after it, as `createSession` writes it |

Index: `sessions_user_id_idx` on `(user_id)`, for ending every session of an account at once.

### Views

| View | Shows |
|---|---|
| `visible_tasks` | every column of `tasks`, for rows where `deleted_at is null` and the project has no `deletion_scheduled_at` |
| `visible_subtasks` | every column of `subtasks`, for rows where `deleted_at is null` and the project, through the task, has no `deletion_scheduled_at`. It does not check whether the task itself is deleted — readers join `visible_tasks` for that |
| `user_today` | `user_id` and `today` for every user — `(now() at time zone timezone)::date`. Fresh on every read, so it changes with nothing written. A timezone Postgres does not recognise makes it fail for that user |

### Functions

| Function | What it answers |
|---|---|
| `is_known_timezone(tz)` | whether `tz` is a name in `pg_timezone_names`. Marked `stable`, not `immutable`: it reads data, so it promises the same answer only within one statement. A `CHECK` cannot hold a subquery, which is why the question lives here |

### `schema_migrations`

Created by the runner, not by a migration. `filename` text primary key, `applied_at` timestamptz.

---

# Appendix — Postgres error codes

Five characters, stable across versions — which is why tests assert the code and not the message.

| Code | Meaning | Where you have met it |
|---|---|---|
| `23505` | unique violation | duplicate email, duplicate active membership, second active lead |
| `23514` | check violation | blank project name or title, a status or priority not on its list, blank notes |
| `23503` | foreign key violation | a task in a project that does not exist |
| `23502` | not-null violation | every new task, between adding `position` and `createTask` supplying one |
| `22003` | number out of range | a task position past 2,147,483,647, before moves and creates learned to renumber |
| `22023` | invalid parameter value | `time zone "Mars/Olympus" not recognized`, reading `user_today` for a user whose timezone is not real |
| `42P17` | invalid object definition | `functions in index predicate must be marked IMMUTABLE` — an index `where x > now()`, tried for the step 4c review. A check accepts the same expression |

Several rules can raise the same code. The error's `constraint` field names the one that did.

---

# Appendix — rules that are easy to forget

- Import paths use **`.js`** even though the files are `.ts`. You are naming the file as it exists at
  runtime, and TypeScript never rewrites import paths. That rule is for your own files only: a bare
  package name like `pg` never takes an extension, a relative path always does.
- `dotenv` does **not** overwrite a variable that is already set. The real environment wins.
- A process copies its environment at launch. Changing `PATH` does nothing to a terminal — or an
  editor — that was already open.
- Applied migrations are never edited. A mistake becomes the next migration.
- Save a migration before applying it. An empty file is recorded as applied and never runs again.
- Creating a unique index or a `CHECK` validates the rows already there, and fails if any break it.
  In `taskco_test` that includes whatever the last test left behind, since tables are emptied
  *before* each test — so after a red run that wrote rows the new rule refuses, empty the tables
  before `migrate:test`.
- A transaction must run on one checked-out client from `pool.connect()`, never on `pool.query`.
- `not null` does not mean "not empty." Text columns accept `''`.
- A `CHECK` sees one row and cannot hold a subquery. Postgres *assumes* its answer never changes for
  that row, and runs it only when the row is written — but does not enforce that, so a check may call
  `now()`, or a function that reads another table. It is safe only when its answer cannot flip later:
  "not in the future" cannot; "the parent row exists" can, which is why that is a foreign key.
  *(Corrected 2026-10-09: this rule used to say `now()` was out of a check's reach.)*
- An index predicate, unlike a check, must be immutable. Postgres refuses `now()` there with `42P17`.
- "At most one" is a constraint; "at least one" is code. No constraint can require that a row exists.
- `truncate ... cascade` also empties every table that references the ones named, all the way down.
- `rows[0]` may be `undefined`. Rows typed `any` are never checked.
- A `check` only refuses when its answer is *false*. For `null` the answer is unknown, so `null` passes.
- A view's `select *` is fixed when the view is created. A new column means re-creating the view.
- Reads go through `visible_tasks` and `visible_subtasks`; writes go to the tables.
- `date` columns arrive as text, because of `db.ts`. `timestamptz` columns still arrive as `Date`.
- `count(*)` is a `bigint`, which arrives as a string. `count(*)::int` gives a number.
- `rowCount` says how many rows an `update` changed — the way to tell "done" from "not found".
- A required column added to a table with rows needs a value for them: add it with a `default`, then
  drop the default.
- A lock is a rule in the database; a sign is a rule in code. Signs only guard the writes that go
  through the code that holds them.
- Every new route goes **above** `app.use((req, res) => … "Not found")`. Below it, it is never
  reached, and its tests fail with `expected 404 to be …`.
- `POST /users` and `POST /sessions` sit **above** "who is asking", because nobody has a session yet.
  Every other route goes below it.
- A route that touches a project names `requireMember` or `requireLead` on its own line, and reads
  the project from `res.locals.project`, never from the path.
- A refusal in `queries.ts` throws `NotFound` or `Refused`, not `Error`; a plain `Error` answers 500.
