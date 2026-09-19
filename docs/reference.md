# Taskco — reference

Every file, organised by the step that built it. For each one: **the code**, **what it does**, and
**what is still open** in that file.

Code blocks are a snapshot taken 2026-09-18. If a block ever disagrees with the file, the file wins.
Inline comments are stripped here so the code reads as code.

Longer reasoning for the open items is in [`slice-a-review.md`](./slice-a-review.md). This file is
for looking things up.

---

## Commands

Run from `C:\WebFiles\Github\Taskco` in PowerShell.

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` — are the types right? Silence means yes. |
| `npm run migrate` | Applies pending migrations to **taskco_dev** |
| `npm run migrate:test` | Applies pending migrations to **taskco_test** |
| `npm test` | Runs the test suite once |
| `npx vitest run -t "second lead"` | Runs only the tests whose name contains that text |
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
- `ended_at` can be earlier than `created_at`. A `CHECK` would forbid it.
- `ended_at` can be in the future, and a `CHECK` **cannot** forbid it — check expressions must be
  immutable and `now()` is not.
- No index on `project_id`. "Who is in this project" would scan the table, and the composite index
  cannot help because an index is only usable from its leading column onward. Add it when slice B's
  member list needs it.
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

## `src/queries.ts`

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

## `src/queries.test.ts`

This section covers slice A's ten tests. The file has since grown to 47 tests in five groups; the
task and subtask tests are listed under step 3.

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

## `src/testing/guard.test.ts`

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

## Migrations 007–013

| File | What it adds |
|---|---|
| `007_create_tasks.sql` | `tasks`: `id`, `project_id` → `projects`, a non-blank `title`, `created_at`; an index on `project_id` |
| `008_add_task_status_and_priority.sql` | `status`, required and starting at `not_started`; `priority`, empty until someone decides. Both checked against their lists |
| `009_add_task_due_date.sql` | `due_date`, a `date`: a calendar day with no time and no timezone |
| `010_soft_delete_tasks.sql` | `deleted_at`, and the `visible_tasks` view |
| `011_add_task_position.sql` | `position`; re-creates `visible_tasks` |
| `012_create_subtask.sql` | `subtasks`: the task fields, with `task_id` → `tasks` as the parent; `visible_subtasks` |
| `013_add_notes.sql` | `notes` on both tables, blank refused; re-creates both views |

Three of them are worth reading for the pattern, not just the columns.

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
| `moveTask({ taskId, afterTaskId?, beforeTaskId? })` | places a task between neighbours, or at either end; renumbers the project when there is no room | `visible_tasks` | yes | task or neighbour missing or deleted; a neighbour in another project |
| `setTaskDueDate({ taskId, dueDate })` | sets the date, clears subtask dates past it, returns `{ clearedSubtasks }` | — | yes | task missing or deleted |
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

## `src/queries.test.ts` — the slice B tests

47 tests in the file — `users` 1, `projects` 4, `memberships` 5, `tasks` 26, `subtasks` 17 — plus 3 in
`guard.test.ts`, for 50 in all.

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

---

# Appendix — current schema

What the tables look like *now*. The migrations are a history; this is their sum.

Two databases, both owned by `taskco_app`, a role with no privileges beyond login.
**taskco_dev** is development; **taskco_test** is wiped before every single test.

### `users`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `email` | text | not null, non-blank, unique on `lower(email)` |
| `timezone` | text | not null, non-blank |
| `created_at` | timestamptz | not null, defaults to `now()` |

### `projects`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `name` | text | not null, non-blank |
| `created_at` | timestamptz | not null, defaults to `now()` |

### `memberships`

| Column | Type | Rules |
|---|---|---|
| `id` | bigint | identity, primary key |
| `user_id` | bigint | not null, → `users(id)`, on delete cascade |
| `project_id` | bigint | not null, → `projects(id)`, on delete cascade |
| `role` | text | not null, `'lead'` or `'associate'` |
| `created_at` | timestamptz | not null, defaults to `now()` |
| `ended_at` | timestamptz | nullable — **null means still a member** |

Indexes: `memberships_user_id_idx` on `(user_id)`; `memberships_one_active_idx`, unique, on
`(user_id, project_id) where ended_at is null`; `memberships_one_lead_idx`, unique, on
`(project_id) where role = 'lead' and ended_at is null`.

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
| `deleted_at` | timestamptz | nullable — **empty means not deleted** |

Index: `tasks_project_id_idx` on `(project_id)`.

### `subtasks`

The same columns and rules as `tasks`, with **`task_id`** bigint, not null, → `tasks(id)`, on delete
cascade, in place of `project_id`. Index: `subtasks_task_id_idx` on `(task_id)`.

Nothing references `subtasks`, which is what keeps nesting to one level.

### Views

| View | Shows |
|---|---|
| `visible_tasks` | every column of `tasks`, for rows where `deleted_at is null` |
| `visible_subtasks` | every column of `subtasks`, for rows where `deleted_at is null` |

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

Several rules can raise the same code. The error's `constraint` field names the one that did.

---

# Appendix — rules that are easy to forget

- Import paths use **`.js`** even though the files are `.ts`. You are naming the file as it exists at
  runtime, and TypeScript never rewrites import paths.
- `dotenv` does **not** overwrite a variable that is already set. The real environment wins.
- A process copies its environment at launch. Changing `PATH` does nothing to a terminal — or an
  editor — that was already open.
- Applied migrations are never edited. A mistake becomes the next migration.
- Save a migration before applying it. An empty file is recorded as applied and never runs again.
- Creating a unique index or a `CHECK` validates the rows already there, and fails if any break it.
- A transaction must run on one checked-out client from `pool.connect()`, never on `pool.query`.
- `not null` does not mean "not empty." Text columns accept `''`.
- A `CHECK` sees one row, through immutable functions only. Other rows, other tables, and `now()` are
  all out of reach.
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
