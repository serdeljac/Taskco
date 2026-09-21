# Taskco — open items

**The one place an item's status lives.** Everything known to be wrong, missing or merely trusted,
in one table, so that fixing something means editing one cell rather than remembering where else it
was written down.

Companion to [`design-decisions.md`](./design-decisions.md) (what is being built and why),
[`learning-path.md`](./learning-path.md) (how the build proceeds) and [`reference.md`](./reference.md)
(what each file is). The checkpoint reviews — [`slice-a-review.md`](./slice-a-review.md),
[`slice-b-review.md`](./slice-b-review.md) — are dated snapshots and no longer carry status.

## How this file works

- **One row per item, named rather than numbered.** A name is stable; a number is not. `timezone`
  was item 9 in one review and item 7 in the next, so "item 7" meant two different things depending
  on which file you were holding.
- **The name never changes**, even after the item closes. It is how the item is referred to in
  commits, in reviews, and in conversation.
- **Status lives here and nowhere else.** No other document says whether something is open.
- **The explanation lives where it was found.** This file gives one line and a link; the reasoning
  stays in the review or the reference section that worked it out.
- **A closed item is not deleted.** It moves to the bottom with what closed it, so a settled
  question does not get raised a second time.

Two kinds of entry are mixed here on purpose. Most are gaps in what exists. A few — marked *Waits
for* — are deliberate deferrals to a later step, listed so that "not built yet" stays
distinguishable from "overlooked."

**Not to be confused with the open questions** in [`design-decisions.md`](./design-decisions.md)
§12. Those are decisions not yet made. These are gaps in what has been built. A question there
becomes a decision; an item here becomes a commit.

---

## Open

### Configuration and the migration runner

| Name | What | Explained in | Status |
|---|---|---|---|
| `env-example-omits-env-test` | `.env.example` documents `DATABASE_URL` and never says `.env.test` is needed too, so a fresh clone passes setup and then fails at `npm test` | [reference, Configuration files](./reference.md) | Open |
| `db-error-names-wrong-variable` | `db.ts` throws `DATABASE URL` while the variable is `DATABASE_URL`, so searching for the message finds nothing | [reference, `src/db.ts`](./reference.md) | Open |
| `migrate-needs-running-twice` | Every migration must be applied to both databases by hand, and forgetting one makes the tests fail for unrelated-looking reasons | [reference, `src/migrate.ts`](./reference.md) | Open |
| `empty-migration-recorded-as-applied` | An empty file is applied and recorded, so SQL written into it later never runs | [reference, `src/migrate.ts`](./reference.md) | Open |
| `migrate-leaves-pool-open-on-failure` | `pool.end()` is never reached when a migration throws. Untidy rather than broken | [reference, `src/migrate.ts`](./reference.md) | Open |
| `no-command-lists-applied-migrations` | Nothing answers "what has been applied" except querying `schema_migrations` by hand | [reference, `src/migrate.ts`](./reference.md) | Open |

### `users` — migration 002

| Name | What | Explained in | Status |
|---|---|---|---|
| `email-lookup-must-lowercase` | The `lower(email)` index is only used by queries written `where lower(email) = lower($1)`, and nothing enforces that | [A §1](./slice-a-review.md) | Open — bites at step 6 |
| `timezone-accepts-any-text` | `Mars/Olympus` inserts happily, and Postgres already knows the real names in `pg_timezone_names` | [A §1](./slice-a-review.md), [B](./slice-b-review.md) | Open |
| `email-has-no-format-or-length-limit` | Zod covers the boundary at step 5; the database stays open to any other caller | [reference, 002](./reference.md) | Open |

### `projects` — migration 003

| Name | What | Explained in | Status |
|---|---|---|---|
| `projects-cascade-unverified` | Nothing has ever deleted a project, so the `on delete cascade` on memberships has never actually run | [A §2](./slice-a-review.md) | Open |
| `visible-projects-filter-arrives-with-delete-mode` | Slice C adds a second visibility condition beside `ended_at is null`, which is where "one place decides what is visible" stops being theoretical | [A §2](./slice-a-review.md) | Waits for slice C |

### `memberships` — migration 004

| Name | What | Explained in | Status |
|---|---|---|---|
| `no-index-on-project-id` | "Who is in this project" scans the table, and the composite index cannot help because an index is only usable from its leading column | [A §3](./slice-a-review.md) | Open — add when a member list needs it |
| `soft-delete-timestamps-unchecked` | `ended_at` and `deleted_at` can fall before `created_at`, and neither can be stopped from holding a future date, because a `CHECK` cannot call `now()` | [A §3](./slice-a-review.md), [B §1](./slice-b-review.md) | Open |
| `membership-rules-untested` | The foreign keys, the role `CHECK`, the cascade, and `removeMember` on a non-member have no test | [A §3](./slice-a-review.md) | Partly — the test guard is covered now |

### `src/queries.ts`

| Name | What | Explained in | Status |
|---|---|---|---|
| `projects-order-no-tiebreaker` | `listProjectsForUser` can return two same-microsecond projects in either order, and Postgres is not obliged to be consistent between runs | [A §2](./slice-a-review.md) | Open |
| `project-type-drift` | `select p.*` returns whatever the table has while `Project` claims three columns. They agree today | [A §4](./slice-a-review.md) | Open |
| `writes-cannot-report-no-such-row` | `removeMember` and the notes writers cannot tell "done" from "no such row", which step 5 needs to choose between success and 404 | [A §4](./slice-a-review.md), [B §5](./slice-b-review.md) | Partly — the deleted-task fixes report a missing task |
| `remove-member-check-and-write-not-atomic` | The role check and the update are separate statements, so a transfer landing between them would still end the new Lead's membership | [reference, `src/queries.ts`](./reference.md) | Open — matters once transfer exists |
| `untyped-queries-return-any` | A query with no row type returns `any` rows, which `noUncheckedIndexedAccess` cannot check | [reference, `src/queries.ts`](./reference.md) | Open |

### Tasks and subtasks — migrations 007–013

| Name | What | Explained in | Status |
|---|---|---|---|
| `writes-dont-check-who-is-asking` | Any caller can create, move or edit anything; permission is enforced from step 5 onward | [B §5](./slice-b-review.md) | Waits for step 5 |
| `no-status-or-priority-functions` | The tests and `seed.ts` set both with raw SQL, because nothing else can | [B](./slice-b-review.md) | Waits for step 5 |
| `subtask-limit-is-a-sign` | The cap of 50 holds only for writes through `createSubtask`, and two at once can both count 49 | [B §2](./slice-b-review.md) | Open |
| `subtask-due-date-rule-is-a-sign` | "Not after its task" lives in `refuseDueDateAfterParent`, so a hand-written insert walks past it | [B §2](./slice-b-review.md) | Open |
| `not-before-today-not-built` | The other half of the subtask date rule needs the asker's timezone, which arrives with sessions | [B](./slice-b-review.md) | Waits for step 6 |
| `positions-can-repeat-or-go-negative` | Nothing constrains the column, and two tasks created at the same instant can read the same last position | [B §1](./slice-b-review.md) | Open |
| `nothing-forces-reads-through-views` | "Reads go through `visible_tasks`" is a convention, not a lock — a query against the table sees everything | [B §3](./slice-b-review.md) | Open |
| `titles-and-notes-have-no-length-limit` | Any length is accepted, on both tables | [B §1](./slice-b-review.md) | Open |
| `three-names-no-longer-say-what-they-mean` | `deleteTask(taskID)`, the test called "oldest first" that orders by position, and migration `012_create_subtask` for a table called `subtasks` | [B](./slice-b-review.md) | Open — the migration name cannot change |

### The test suite

| Name | What | Explained in | Status |
|---|---|---|---|
| `email-test-in-wrong-describe` | A users test sits under `projects`, and the describe path is what you read when something fails | [A §6](./slice-a-review.md) | Open |
| `test-grouping-axis-inconsistent` | `users` and `projects` are tables, but `memberships` holds tests that are really about `listProjectsForUser` | [A §6](./slice-a-review.md) | Open |
| `test-independence-unproven` | Independence is assumed by construction; `npx vitest run --sequence.shuffle` would demonstrate it | [A §6](./slice-a-review.md) | Open |
| `tests-only-exercise-queries-ts` | Every test goes through the functions that hold the signs, which is exactly what makes a sign look like a lock from inside the suite | [B §6](./slice-b-review.md) | Open |
| `env-config-result-discarded` | A missing `.env.test` surfaces as a different complaint than the one that actually happened | [reference, `src/testing/env.ts`](./reference.md) | Open |
| `truncate-misses-unreferenced-tables` | `cascade` follows foreign keys only, so a table referencing none of the three would survive. Nothing in the design is shaped that way | [reference, `src/testing/setup.ts`](./reference.md) | Open |
| `pool-close-depends-on-file-isolation` | Setting `isolate: false` for speed would let the first file to finish close the pool underneath the others | [reference, `src/testing/setup.ts`](./reference.md) | Open |
| `guard-throws-on-invalid-url` | A malformed address stops the run with "Invalid URL" rather than the guard's own message. It still refuses to run | [reference, `src/testing/guard.ts`](./reference.md) | Open |

### Throwaway tools, and work not started

| Name | What | Explained in | Status |
|---|---|---|---|
| `preview-queries-per-task` | `preview.ts` fetches subtasks with one query per task — fine for four, not for a page | [reference, `src/preview.ts`](./reference.md) | Open — deleted at step 7 |
| `transfer-must-demote-before-promote` | `memberships_one_lead_idx` is checked as each row is written, not at commit, so transfer must demote before it promotes, inside one transaction | [reference, 006](./reference.md) | Waits for transfer |

---

## Closed

Kept so a settled question is not reopened. The reasoning is in the review that raised it.

| Name | Raised | How it closed |
|---|---|---|
| `one-lead-per-project` | [A §3](./slice-a-review.md) | Migration `006` for *at most one*, a check in `removeMember` for *at least one* — `8643ab3`, `7f6c987` |
| `test-guard-checks-whole-url` | [A §5](./slice-a-review.md) | `isTestDatabase` parses the address and judges the database name, with three tests of its own — `f61b560` |
| `truncate-list-hand-maintained` | [A §5](./slice-a-review.md) | **Dropped — the claim was wrong.** `truncate ... cascade` already empties referencing tables |
| `swappable-id-arguments` | [A §4](./slice-a-review.md) | `addMember` and `removeMember` take one labelled object — `e064f11` |
| `unchecked-indexed-access` | [A §4](./slice-a-review.md) | Turned on in `tsconfig.json`; five places had to handle the empty case — `0e4f52a` |
| `deleted-task-still-editable` | [B §5](./slice-b-review.md) | The writers find their task through `visible_tasks` and refuse when it is gone — `eee74db` |
| `move-task-across-projects` | [B §5](./slice-b-review.md) | `moveTask` refuses unless the task and both neighbours share a project — `eee74db` |
