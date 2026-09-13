# Slice A — review

Written 2026-09-06, after slice A was built and passing. Companion to
[`design-decisions.md`](./design-decisions.md) and [`learning-path.md`](./learning-path.md).

This is the checkpoint the learning path calls for: re-reading what was built, now that building it
has taught things that writing the design could not. Two lists per piece — what was built, and what
is still open.

**Nothing here came from a failing test.** Every test passed before this review and every test passes
after it. The open items were found by reading each file and asking what it actually guarantees.

**Follow-up, 2026-09-13.** The items marked for doing before slice B have been worked through on
branch `slice-a-fixes`. The Status column below is current; the sections after it are the 2026-09-06
snapshot, except where marked *Corrected*. One item turned out to be wrong — see item 3, and the
follow-up at the end.

---

## Everything still open, in one place

| # | Open item | Where | Status |
|---|---|---|---|
| 1 | Nothing enforces one lead per project | 004 memberships | **Fixed** — migration 006 (at most one), `removeMember` (at least one) |
| 2 | `_test` guard checks the raw URL, not the database name | test harness | **Fixed** — `isTestDatabase` parses the URL, and is tested |
| 3 | Truncate list is hand-maintained; breaks when slice B adds tables | test harness | **Wrong — dropped.** `cascade` already covers them; see section 5 |
| 4 | `addMember` takes two adjacent `string` ids — a swap is invisible | queries.ts | **Fixed** — labelled object, in `removeMember` too |
| 5 | `order by created_at` has no tiebreaker | 003 projects | Open |
| 6 | `lower(email)` index only works if lookups use `lower()` | 002 users | Open |
| 7 | `removeMember` cannot report that it matched nothing | queries.ts | Open |
| 8 | `select p.*` and the `Project` type can drift apart | queries.ts | Open |
| 9 | `timezone` accepts any string | 002 users | Open |
| 10 | No index on `project_id` | 004 memberships | Open |
| 11 | Untested: foreign keys, role `CHECK`, `on delete cascade`, the guard | tests | Partly — the guard is now tested |
| 12 | `.env.example` never mentions that `.env.test` is required too | step 1 config | Open |

Items 1–3 were marked as worth doing before slice B; item 4 and `noUncheckedIndexedAccess` (section 4)
joined that batch. The rest are notes.

---

## 1. Migration 002 — `users`

**Built**

- `email` and `timezone` added, both required
- Unique index on `lower(email)`, so case variants of one address cannot both exist
- Blank email and blank timezone rejected (migration 005)
- Tested: two users with the same address in different cases → `23505`

**Open**

- The `lower(email)` index is only used by queries written `where lower(email) = lower($1)`. Nothing
  enforces that, and no query looks users up by email yet. Step 6 authentication is where a
  case-sensitive lookup would silently fail to find a real account.
- `timezone` accepts any string. `Mars/Olympus` inserts fine. Postgres knows the valid names
  (`pg_timezone_names`), and the design leans on timezones for overdue dates and routine streaks.
- `email` has no format or length constraint. Zod covers this at the HTTP boundary in step 5, but a
  boundary check does not protect the database from other callers.

---

## 2. Migration 003 — `projects`

**Built**

- `id`, `name`, `created_at`
- No `lead_user_id` and no `created_by` — leadership lives only on memberships, so there is nowhere
  for a stale copy to exist. The design decision is confirmed by what is absent.
- Blank name rejected (migration 005), tested → `23514`

**Open**

- `listProjectsForUser` orders by `created_at` with no tiebreaker. Two projects created in the same
  microsecond can come back in either order, and Postgres is not obliged to be consistent between
  runs. `order by p.created_at, p.id` makes it total.
- Nothing has ever deleted a project, so the `on delete cascade` on memberships is unverified.
- Delete mode adds columns here in slice C, and with them a second visibility filter alongside
  `ended_at is null`. That is the point at which "one place decides what is visible" stops being
  theoretical.

---

## 3. Migration 004 — `memberships`

**Built**

- Join table: `user_id` and `project_id`, both foreign keys, both `on delete cascade`
- `role text not null check (role in ('lead', 'associate'))`
- Index on `user_id`, supporting "what projects am I in"
- Partial unique index on `(user_id, project_id) where ended_at is null` — one *active* membership
  per person per project, while ended rows accumulate as history
- Tested: adding the same person twice → `23505`

**Open**

- **Nothing enforces one lead per project.** `addMember(project, someone, "lead")` succeeds, so two
  active leads are possible. `removeMember` on the lead succeeds, so zero leads are possible.
  `createProject` gets it right; nothing keeps it right.
  - *At most one* is a one-line fix — a partial unique index on `(project_id) where role = 'lead'
    and ended_at is null`.
  - *At least one* cannot be a constraint. No constraint can require that a row exists. It has to
    live in application code, in `removeMember` and in transfer.
  - General rule: upper bounds are cheap and permanent, lower bounds are application logic and can
    be forgotten. "Exactly one" is always two mechanisms.
- `ended_at` can be earlier than `created_at`. A `CHECK` would forbid it.
- `ended_at` can be in the future, and a `CHECK` *cannot* forbid it — check expressions must be
  immutable, and `now()` is not.
- No index on `project_id`. "Who is in this project" would scan the table, and the composite index
  cannot help because an index is only usable from its leading column onward. Add it when slice B's
  member list actually needs it, not before.
- Foreign keys, the role `CHECK`, and the cascade are all unproven — no test exercises any of them.
- The index on `user_id` can never be proven by a test. Indexes affect speed, not results; delete it
  and every test still passes. `EXPLAIN` is how you check those.

---

## 4. `src/queries.ts`

**Built**

- Five functions: `createUser`, `createProject`, `addMember`, `removeMember`, `listProjectsForUser`
- Every value passed as `$1`, `$2` — no string concatenation anywhere
- `createProject` is one transaction on one checked-out client: project row, then lead membership,
  then commit. Rollback and rethrow on failure, release in `finally`.
- `listProjectsForUser` joins memberships to projects and excludes ended memberships

**Open**

- The comment above `createUser` is wrong: `pool.query` **returns** the connection to the pool, it
  does not close it. Worth fixing because a wrong comment is a wrong mental model that will be
  re-read and re-learned — wrong code gets caught by a test, wrong prose does not.
- `addMember(projectId, userId, role)` takes two adjacent `string` ids. Swapping them compiles, and
  if a user exists with that id the foreign key is satisfied and the wrong data is written silently.
  `role` is protected by its union type; the ids are not. An options object fixes it cheaply;
  branded types fix it thoroughly. Worth deciding before slice B puts three ids in scope at once.
- `removeMember` ignores `rowCount`, so it cannot distinguish "removed them" from "they were not a
  member." Step 5 needs that distinction to choose between success and 404.
- `removeMember` is also where the "the last lead cannot leave" rule will have to live.
- `select p.*` returns whatever columns the table currently has, while `<Project>` claims three.
  They agree today. Slice C adds columns and they stop agreeing, with nothing to announce it.
- `rows[0]` is safe after `insert ... returning *`, which always yields one row. It is not safe after
  a `select` that finds nothing — TypeScript will still insist the result is a `Project`.
  `noUncheckedIndexedAccess` is the setting that catches this, and slice B is when the first such
  query appears.

---

## 5. The test harness

**Built**

- `.env.test` holding the `taskco_test` connection string, git-ignored by the existing `.env.*` rule
- `src/testing/env.ts` loads it and refuses to continue unless the database name ends in `_test`
- `src/testing/setup.ts` imports `env.js` **first**, so the environment exists before `db.ts` reads it
- `truncate ... restart identity cascade` before each test; pool closed in `afterAll`
- `fileParallelism: false`, because every test file talks to the same database
- `npm run migrate:test` applies migrations to the test database, using `tsx --env-file`

**Confirmed, better than designed**

The guard fails safe in a case it was not written for. If `.env.test` goes missing, `dotenv` loads
nothing silently — and the guard then catches either an unset `DATABASE_URL` or a shell variable
still pointing at `taskco_dev`. It was written to catch typos; it also catches the file not existing.

**Open**

- The guard tests the **whole URL string** with `endsWith("_test")`, not the database name. A URL
  ending `/taskco_dev?application_name=_test` passes the check while pointing at the development
  database. Parsing the URL and testing `pathname` fixes it. General rule: when a string has
  structure, validate the structure, not the string.
- The truncate list is hardcoded. Slice B adds `tasks` and `subtasks`, and forgetting to add them
  here means rows survive between tests — a test that passes alone and fails after another one.
  Asking the database which tables exist cannot fall out of date.
  - **Corrected 2026-09-13 — this item is wrong.** The statement ends in `cascade`, which also empties
    every table that references the named ones, and every table that references those. `tasks` will
    reference `projects` and `subtasks` will reference `tasks`, so both are emptied without being
    listed. Verified by creating a referencing table inside a transaction that was rolled back. Only a
    table referencing none of the three would survive, and nothing in the design is shaped like that.
    The item was written from the list of names without following what `cascade` adds to it.
- The result of `config()` is discarded, so a missing `.env.test` surfaces as a different complaint
  than the one that actually happened.
- The guard is the most safety-critical line in the project and is itself untested, because it throws
  during import. Extracting the decision into `isTestDatabase(url)` would make it assertable.

---

## 6. The tests

**Built**

- Eight tests against the real database — no mocks
- **Four of the eight assert refusals** rather than successes: duplicate email, blank project name,
  duplicate membership, and the departed member disappearing
- Independent by construction: truncate and identity reset before each one
- Verified by experiment that removing `and m.ended_at is null` fails exactly one test, and that the
  failure names the behaviour in plain English

**Open**

- "refuses two users with the same email in different cases" sits in the `projects` describe. It is
  a users test, and the describe path is what you read when something fails.
- The grouping axis is inconsistent — `users` and `projects` are tables, but `memberships` holds two
  tests that are really about `listProjectsForUser`. Pick one axis before there are thirty tests.
- Independence is assumed rather than proven. `npx vitest run --sequence.shuffle` randomises the
  order and would demonstrate it.
- Not covered: foreign keys, the role `CHECK` (which needs a deliberate TypeScript bypass), the
  cascade, two leads on one project, `removeMember` on a non-member, and the ordering of
  `listProjectsForUser`.

---

## Design decisions this slice changed

Both recorded in [`design-decisions.md`](./design-decisions.md):

- **"One membership per person per project" was impossible as written.** It contradicted soft-deleted
  memberships and re-invitation, which the same document also requires. Corrected to *one active
  membership*, enforced by a partial unique index. It surfaced not from a bug but from trying to
  write the constraint and finding the sentence did not describe one.
- **Ids are `bigint`, and `pg` returns them as strings**, because they exceed what JavaScript can
  represent exactly. This propagates: step 5 serialises them as strings and step 7 receives strings.
  Anywhere someone writes `id === 1` instead of `id === "1"` will silently never match.

---

## Follow-up — the fixes before slice B

Done 2026-09-10 to 2026-09-13 on branch `slice-a-fixes`, one commit per item. Each was built
test-first: the test was written and seen to fail before the change that made it pass.

| Item | Commit | What changed |
|---|---|---|
| 1, at most one lead | `8643ab3` | Migration 006: a partial unique index on `(project_id) where role = 'lead' and ended_at is null`. The test asserts the constraint name as well as `23505`, because two indexes on `memberships` now raise that code. |
| 1, at least one lead | `7f6c987` | `removeMember` looks up the member's role and throws if it is `lead`, before ending anything. |
| 2 | `f61b560` | The guard's decision moved into `isTestDatabase(url)` in `src/testing/guard.ts`, which reads the database name from the parsed URL. Three tests, one of them an address ending in `_test` that names `taskco_dev`. |
| 3 | — | Dropped. It was wrong; see the correction in section 5. |
| 4 | `e064f11` | `addMember` and `removeMember` take `{ projectId, userId }` instead of ids in a row. |
| `noUncheckedIndexedAccess` | `0e4f52a` | Turned on. `createUser` and `createProject` throw if their insert returns no row; the tests read list items with `?.`. |

Also resolved along the way: the wrong comment above `createUser` was deleted, and "two leads on one
project" is now covered by a test, as is removing the Lead.

**What item 3 taught about reviews.** It was found by checking a claim before building its fix, not by
a failing test. That is the same technique the review itself used, pointed at the review: a list of
open items is a set of claims, and a claim can be wrong.

**Still true after the fixes:** a query with no row type returns `any` rows, which
`noUncheckedIndexedAccess` cannot check. `removeMember` guards `rows[0].role` with `rows.length > 0`;
the lead-role test does not need to. Every query slice B adds should declare its row type.
