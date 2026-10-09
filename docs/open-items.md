# Taskco — open items

**The one place an item's status lives.** Everything known to be wrong, missing or merely trusted,
in one table, so that fixing something means editing one cell rather than remembering where else it
was written down.

Companion to [`design-decisions.md`](./design-decisions.md) (what is being built and why),
[`learning-path.md`](./learning-path.md) (how the build proceeds) and [`reference.md`](./reference.md)
(what each file is). The checkpoint reviews — [`slice-a-review.md`](./slice-a-review.md),
[`slice-b-review.md`](./slice-b-review.md), [`slice-c-review.md`](./slice-c-review.md),
[`step-4b-review.md`](./step-4b-review.md), [`step-4c-review.md`](./step-4c-review.md) — are dated snapshots and no longer carry status.

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
| `email-lookup-must-lowercase` | The `lower(email)` index is only used by queries written `where lower(email) = lower($1)`, and nothing enforces that | [A §1](./slice-a-review.md) | Partly — `createInvite` is the first such lookup and does it correctly. Step 6's login is the next one, and would silently fail to find a real account if it forgot |
| `timezone-accepts-any-text` | `Mars/Olympus` inserts happily, and Postgres already knows the real names in `pg_timezone_names` | [A §1](./slice-a-review.md), [B](./slice-b-review.md), [4c](./step-4c-review.md) | Open — **worth fixing before merging step 4c.** Every routine read for a user with `Mars/Olympus` fails with `22023`, and so does any read of *everyone's* today — one bad row breaks it for all. A `CHECK` calling a function that asks `pg_timezone_names` was run inside a rolled-back transaction and refuses it as a lock, at about 20 ms per new user |
| `email-has-no-format-or-length-limit` | Zod covers the boundary at step 5; the database stays open to any other caller | [reference, 002](./reference.md) | Open |
| `deactivated-accounts-can-still-be-invited-or-added` | Nothing reads `users.deletion_scheduled_at` except `restoreProject`, `reopenAccount` and the purge. So `createInvite` still finds an account being deleted, `addMember` still adds it, and `acceptInvite` still lets it join — a membership the purge then removes thirty days later. Since step 4c it can also create routines and complete them | Doc pass, 2026-10-08 — this row is the record | Open — needs deciding: treat it as "No email found", or let the act reopen the account. Step 6's login is where it meets a real person |

### `projects` — migration 003

| Name | What | Explained in | Status |
|---|---|---|---|
| `visible-projects-filter-arrives-with-delete-mode` | Slice C adds a second visibility condition beside `ended_at is null`, which is where "one place decides what is visible" stops being theoretical | [A §2](./slice-a-review.md) | Waits for slice C |

### `memberships` — migration 004

| Name | What | Explained in | Status |
|---|---|---|---|
| `refuse-unless-current-member-locks-too-hard` | `refuseUnlessCurrentMember` takes `for update` on a membership it never modifies. `for share` would be correct, and would let two assignments to the same person proceed at once instead of queueing | [reference, `src/queries.ts`](./reference.md) | Open — stricter than needed, not wrong |
| `concurrent-transfer-reads-as-project-not-found` | A transfer that waits on another transfer's lock finds the Lead row no longer says `lead` once it gets it, returns nothing, and is refused as "project not found". Safe, and the wrong words | [4b](./step-4b-review.md) | Open |
| `end-membership-errors-name-remove-member` | `endMembership` throws `removeMember: membership not found` whoever called it. `deleteAccount` racing a removal of the same person fails with exactly that, and rolls back correctly | [4b](./step-4b-review.md) | Open |
| `lead-cannot-read-tasks-in-delete-mode` | `visible_tasks` and `visible_subtasks` hide every project with a deletion date from everyone, so `listTasks` and `listSubtasks` give the Lead empty lists. Section 6 says the Lead can still read and export. A view cannot tell the Lead from an associate, so the Lead's read will have to go around the views. The test "hides the tasks of a project being deleted" asserts the gap, for the Lead | [design §6](./design-decisions.md) | Open — export, design section 12, will hit it first |
| `unacceptable-invites-are-still-listed` | `listInvitesForUser` does not exclude projects being deleted, nor invites whose recipient has since been added directly, so a user is shown an invite that acceptance will refuse | [C](./slice-c-review.md) | Open |
| `delete-mode-helper-passes-unknown-projects` | `refuseIfProjectIsBeingDeleted` reads `rows[0]?.deletion_scheduled_at`, so a project that does not exist is falsy and passes. The write then fails later on a foreign key | [C](./slice-c-review.md) | Open |
| `delete-now-refusal-untested` | `deleteProjectNow` refuses a project already in delete mode, and no test says so | [C](./slice-c-review.md) | Open |
| `views-now-join-projects-on-every-read` | `visible_tasks` joins `projects` and `visible_subtasks` joins `tasks` and `projects`, on every read of either | [C](./slice-c-review.md) | Open — the price of the rule holding itself |
| `expired-invites-are-never-removed` | Nothing deletes an expired invite except a re-invite to the same address, so dead rows accumulate | [C](./slice-c-review.md) | Open — belongs with purging, design section 12, and `purgeDeletedProjects` is the natural place for it |
| `transfer-notifies-nobody` | Section 6 says the new Lead is notified. There are no notifications; the durable signal, their role in the members list, is already right | [design §6](./design-decisions.md) | Open — step 5 |
| `delete-mode-notifies-nobody` | Section 6 says members get a notification of the project's status, telling them to contact the Lead | [C](./slice-c-review.md) | Open — step 5 |
| `invites-email-lookup-unindexed` | `listInvitesForUser` joins on `lower(email)`, which no index covers: the unique index on `invites` leads with `project_id`, so it cannot help. An index on `lower(email)` would | [reference, `src/queries.ts`](./reference.md) | Open — add it when the table is big enough to care, the same rule as `no-index-on-project-id` |
| `no-index-on-project-id` | "Who is in this project" scans the table, and the composite index cannot help because an index is only usable from its leading column | [A §3](./slice-a-review.md) | Open — add when a member list needs it |
| `soft-delete-timestamps-unchecked` | `ended_at` and `deleted_at` can still hold a future date, which no `CHECK` can refuse because a check expression must be immutable and `now()` is not. Every query tests `is null` rather than `<= now()`, so a future value reads as deleted straight away — it is a lie about *when*, not a state the app misreads | [A §3](./slice-a-review.md), [B §1](./slice-b-review.md) | Partly — migration `014` locks the ordering: neither can fall before `created_at`. **Fixable after all**: Postgres does not require a check to be immutable, and "not in the future" can never flip, so `<= now()` can be a lock — see [4c](./step-4c-review.md) section 7 |
| `membership-rules-untested` | The foreign keys and the role `CHECK` have no test. The `CHECK` needs a deliberate cast to reach, since `Role` is a union type and `addMember` will not pass `"manager"` without one | [A §3](./slice-a-review.md) | Partly — the cascade and `removeMember` on a non-member are covered now |

### `src/queries.ts`

| Name | What | Explained in | Status |
|---|---|---|---|
| `project-type-drift` | `select *` returns whatever the table has while the row type claims a fixed list. Applies to `Project`, `Task` and `Subtask` alike | [A §4](./slice-a-review.md) | Open — **no longer hypothetical.** Migration `015` added a column to `tasks` and `subtasks`; the types went on claiming the old shape, and nothing noticed until a test read the field. The drift starts when the migration runs and stays invisible until something reaches for the missing piece |
| `untyped-queries-return-any` | A query with no row type returns `any` rows, which `noUncheckedIndexedAccess` cannot check | [reference, `src/queries.ts`](./reference.md) | Partly — `removeMember` declares its row type now; the test "gives the creator the lead role" is what is left |

### Tasks and subtasks — migrations 007–013

| Name | What | Explained in | Status |
|---|---|---|---|
| `writes-dont-check-who-is-asking` | Any caller can create, move or edit anything; permission is enforced from step 5 onward | [B §5](./slice-b-review.md) | Waits for step 5 |
| `no-status-or-priority-functions` | The tests and `seed.ts` set both with raw SQL, because nothing else can | [B](./slice-b-review.md) | Waits for step 5 |
| `subtask-limit-is-a-sign` | The cap of 50 holds only for writes through `createSubtask`, and two at once can both count 49 | [B §2](./slice-b-review.md) | Open |
| `subtask-assignee-project-check-is-a-sign` | A subtask stores no `project_id`, so its assignee foreign key can only prove the membership exists. That it belongs to the parent task's project is checked in `refuseUnlessCurrentMember`, and only for writes that go through `setSubtaskAssignee` | [design — section 7](./design-decisions.md) | Open |
| `assignee-not-current-is-a-sign` | "Has not left" cannot be a lock on either table: leaving sets `ended_at` and the row stays, so every foreign key remains satisfied. `refuseUnlessCurrentMember` and `removeMember`'s clearing are the whole of it | [design — section 7](./design-decisions.md) | Open |
| `subtask-due-date-rule-is-a-sign` | "Not after its task" lives in `refuseDueDateAfterParent`, so a hand-written insert walks past it | [B §2](./slice-b-review.md) | Open |
| `not-before-today-not-built` | The other half of the subtask date rule needs the asker's timezone, which arrives with sessions | [B](./slice-b-review.md) | Waits for step 6 |
| `positions-can-repeat-or-go-negative` | Nothing constrains the column, and two tasks created at the same instant can read the same last position | [B §1](./slice-b-review.md) | Open |
| `nothing-forces-reads-through-views` | "Reads go through `visible_tasks`" is a convention, not a lock — a query against the table sees everything | [B §3](./slice-b-review.md) | Open — **demonstrated twice.** On 2026-09-30, migration `017` gave the views a delete-mode condition and six writers picked it up untouched, while `setTaskNotes`, filtering the table directly, silently kept the old behaviour. On 2026-10-03 a code review found `setTaskDueDate` doing the same — and the slice C review had listed it among the writers that refused, so the second miss also survived a review |
| `view-refusals-take-no-lock` | The writers that refuse a project being deleted by reading through the views hold no lock on the project row, so a `deleteProject` — or a `deleteTask` — that commits between their read and their write does not stop them. Widest in `createSubtask` and `setSubtaskDueDate`, which run no transaction at all. `refuseIfProjectIsBeingDeleted` takes `for share` precisely to close this gap, and a view cannot | Code review, 2026-10-03 — no review file; this row is the record | Open — harmless until there are concurrent users |
| `titles-and-notes-have-no-length-limit` | Any length is accepted, on both tables | [B §1](./slice-b-review.md) | Open |
| `three-names-no-longer-say-what-they-mean` | `deleteTask(taskID)`, the test called "oldest first" that orders by position, and migration `012_create_subtask` for a table called `subtasks`, and `014_soft_delete_timestamp_unchecked` named for the problem rather than the change | [B](./slice-b-review.md) | Open — the migration name cannot change |
| `renumber-is-one-query-per-task` | `renumberTasks` writes one `update` per task, so renumbering a large project is that many round trips inside a transaction holding a lock on every row. A single statement over `unnest` would do it in one | [reference, `src/queries.ts`](./reference.md) | Open — invisible until a project is large |
| `tasks-per-project-capped-by-position-spacing` | Renumbering writes `(index + 1) * 65536`, and only 32,767 of those fit in an `integer`, so a project with more tasks than that overflows while being renumbered. Renumbering reclaims space that churn wasted; it cannot create space that was never there | [reference, `src/queries.ts`](./reference.md) | Open — needs narrower spacing or a wider column, and `bigint` would arrive as a string |

### The test suite

| Name | What | Explained in | Status |
|---|---|---|---|
| `test-grouping-axis-inconsistent` | `users` and `projects` are tables, but `memberships` holds tests that are really about `listProjectsForUser` | [A §6](./slice-a-review.md) | Partly — since 2026-10-08 the tests sit in `src/test_queries`, one file per table, but `2_memberships.test.ts` still holds `listProjectsForUser`, the hard-delete cascade and the task assignee tests |
| `step-4b-refusals-untested` | Six behaviours hold and have no test: deleting an account twice, reopening one never deleted, transferring to the current Lead, transferring in a project that does not exist, a project past its date staying gone when its Lead reopens, and an earlier project date surviving account deletion | [4b](./step-4b-review.md) | Open |
| `routine-refusals-untested` | Four behaviours hold and have no test: a routine with a blank name is refused; undoing when nothing was done today is refused; undoing someone else's routine is refused; and a completion on an unscheduled day is recorded and shown as done, but not counted | [4c](./step-4c-review.md) | Open |
| `two-tests-read-today-twice` | "Says whether a routine is due today" and "counts a streak from the owner's own today" each work out today themselves, then call a function that works it out again. A midnight in Zagreb between the two reads fails them, though the code is right | [4c](./step-4c-review.md) | Open — reasoned, not run: the clock cannot be moved from a test |
| `tests-only-exercise-queries-ts` | Every test goes through the functions that hold the signs, which is exactly what makes a sign look like a lock from inside the suite | [B §6](./slice-b-review.md) | Open |
| `env-config-result-discarded` | A missing `.env.test` surfaces as a different complaint than the one that actually happened | [reference, `src/testing/env.ts`](./reference.md) | Open |
| `truncate-misses-unreferenced-tables` | `cascade` follows foreign keys only, so a table referencing none of the three would survive. Nothing in the design is shaped that way | [reference, `src/testing/setup.ts`](./reference.md) | Open |
| `pool-close-depends-on-file-isolation` | Setting `isolate: false` for speed would let the first file to finish close the pool underneath the others — and there are seven files now, not two | [reference, `src/testing/setup.ts`](./reference.md) | Open |
| `guard-throws-on-invalid-url` | A malformed address stops the run with "Invalid URL" rather than the guard's own message. It still refuses to run | [reference, `src/testing/guard.ts`](./reference.md) | Open |
| `assignee-tests-set-what-is-already-there` | "assigns a task to a member of its own project" and "shows the assignee through visible_tasks" write the Lead's membership as the assignee, which `createTask` has set by default since `7acc1a3`, so their `update` changes nothing. Both still prove something — the first because `createTask`'s insert already passed the key, the second because the view must carry the column — but neither exercises the step it sets up. Assigning another member would | Code review, 2026-10-03 — no review file; this row is the record | Open |

### Routines — migration 019

| Name | What | Explained in | Status |
|---|---|---|---|
| `routines-cannot-be-edited-or-deleted` | No function renames a routine, changes its days, or deletes it. Deleting is simple — completions cascade. Changing the days is not: `getStreak` reads the *current* days for the whole history, so turning a weekday routine into an every-day one would make every past weekend a miss and cut the streak short. The same shape as the invite expiry: an input the past depends on, stored only as its latest value | [design §9](./design-decisions.md) | Waits — decide what a change of days does to the past before building it |
| `streaks-are-one-query-per-routine` | `getStreak` answers for one routine, in two queries. A screen showing every routine's streak calls it once per routine | [reference, `src/queries.ts`](./reference.md) | Open — fine for a handful; step 5 or 7 decides whether `listRoutines` carries the streak |
| `weekday-numbering-written-twice` | "Which weekday is this date" is written twice: `extract(isodow …)` in `listRoutines` and `isoWeekday` in `streak.ts`. Both use 1 for Monday and 7 for Sunday today; nothing makes them agree. Run for the step 4c review across forty-two days, taking in both October's and March's change of clocks and a new year, they agree on every one | [reference, `src/streak.ts`](./reference.md) | Open — a test that checks both on the same dates would hold them together |

### Across files

| Name | What | Explained in | Status |
|---|---|---|---|
| `explanations-still-in-comments` | `migrate.ts` and migrations 002 and 004 still carry the kind of notes `db.ts` shed. The two migrations are applied, so clearing theirs means editing an applied file | `ea5427c` | Partly — the test notes went when the tests moved to `src/test_queries`; the migrations need a decision first |
| `docs-say-a-check-cannot-call-now` | Seven passages say a `CHECK` cannot refuse a future date because it must be immutable. Run inside a rolled-back transaction, Postgres accepted `check (x <= now())` and refused a future moment with `23514`. Index predicates *are* held to immutable (`42P17`); checks are only assumed to be | [4c](./step-4c-review.md) | Open — **worth fixing before merging step 4c**: correct the seven passages |

### Throwaway tools, and work not started

| Name | What | Explained in | Status |
|---|---|---|---|
| `preview-queries-per-task` | `preview.ts` fetches subtasks with one query per task — fine for four, not for a page | [reference, `src/preview.ts`](./reference.md) | Open — deleted at step 7 |
| `account-deletion-list-not-built` | Section 6 starts account deletion by showing every project the user leads, each with that project's other members to choose from. No query answers that yet; `transferLeadership` and `deleteAccount` are the writes it would drive | [design §6](./design-decisions.md) | Waits for step 5 |
| `purge-runs-only-by-hand` | `purgeDeletedProjects` and `purgeDeletedAccounts` run only when someone types `npm run purge`. Until something calls them on a schedule, a project or account past its date is gone from every answer but still on disk | [design §6](./design-decisions.md) | Waits for step 5, or for hosting |

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
| `remove-member-check-and-write-not-atomic` | [reference, `src/queries.ts`](./reference.md) | `removeMember` runs on one checked-out client, and the role lookup takes `for update`, so a concurrent transfer blocks rather than slipping between the check and the write. The race is reasoned, not demonstrated: no test in the suite goes red for it |
| `cleared-count-includes-deleted-subtasks` | [reference, `src/queries.ts`](./reference.md) | `setTaskDueDate` still clears a deleted subtask's date, so a restored subtask cannot come back breaking the rule, but it counts only the rows the Lead can see. One statement, with `returning` in place of `rowCount` |
| `positions-grow-until-they-overflow` | [reference, `src/queries.ts`](./reference.md) | `moveTask` treats the ceiling as one more way a candidate has no room; `createTask` renumbers first when the next position would not fit. Renumbering now lives in one place, `renumberTasks`, which both call |
| `projects-cascade-unverified` | [A §2](./slice-a-review.md) | One test hard-deletes a project and asserts its memberships, tasks and subtasks all went — subtasks by two hops, through tasks — and that both users survived, because a cascade runs from parent to child only |
| `projects-order-no-tiebreaker` | [A §2](./slice-a-review.md) | `listProjectsForUser` orders by `created_at, id`, added while the same query gained its delete-mode filter |
| `accept-ignores-delete-mode` | [design §5](./design-decisions.md) | `acceptInvite` calls `refuseIfProjectIsBeingDeleted` after the expiry check, so an invite still inside its window is refused on the project's state at the moment it is accepted |
| `writes-outside-the-views-ignore-delete-mode` | [design §6](./design-decisions.md) | `createTask`, `removeMember` and `createInvite` call the helper; `deleteTask` reads through `visible_tasks`; `addMember` puts the condition in an `insert ... select ... where exists`, one statement with no gap |
| `accept-can-collide-with-membership` | [C](./slice-c-review.md) | `acceptInvite` asks whether the recipient already holds an active membership, after the delete-mode check and before the insert, and refuses with a sentence. Two tests: the refusal, which failed first on the database's own duplicate-key message; and someone who left accepting a new invite, which goes red if `ended_at is null` is dropped from the check. A sign in front of a lock: a direct add landing between the check and the insert still raises `23505`, and the index keeps the data right either way. The refused invite stays, because a throw rolls the transaction back — see `unacceptable-invites-are-still-listed` |
| `scheduled-deletion-never-happens` | [C](./slice-c-review.md) | Split in two, decided in design section 6. *Gone* is derived: past `deletion_scheduled_at`, `listProjectsForUser` drops the project for its Lead and `restoreProject` refuses it, both by testing `> now()`. *Removed* is `purgeDeletedProjects`, which deletes every project at `<= now()` and lets the cascades take the rest — its test is the first to prove invites go with their project. Run by hand for now; see `purge-runs-only-by-hand`. Four tests, each of which fails against the code before it |
| `transfer-must-demote-before-promote` | [reference, 006](./reference.md) | `transferLeadership` locks the Lead's row and then the new Lead's, demotes, then promotes, inside one transaction. Swapping the two updates makes two tests fail with `23505` from `memberships_one_lead_idx`, which is exactly the trap this row recorded in slice A |
| `restore-ignores-the-leads-account` | [C](./slice-c-review.md) | `restoreProject` adds a `not exists` for a current Lead whose account is being deleted, in the same statement as the write, reading the date migration `018` gave accounts. One test; it goes red if the condition is removed |
| `email-test-in-wrong-describe` | [A §6](./slice-a-review.md) | Moved into `1_users.test.ts` when the tests were split into `src/test_queries`, one file per table |
| `test-independence-unproven` | [A §6](./slice-a-review.md) | `npx vitest run --sequence.shuffle` passed all 128 tests with three different seeds on 2026-10-08, across the seven test files. Demonstrated rather than assumed, which is what the item asked for |
| `transfer-accepts-an-account-being-deleted` | [4b](./step-4b-review.md) | `transferLeadership` reads the new Lead's account in the same statement as their membership and refuses one being deleted, with its own message rather than "not a member". It locks only the membership row: a concurrent `deleteAccount` of the same person must end that same membership, so the two queue on one lock. One test, which fails against the old code with the promise resolving. The wider question — whether such an account can join a project at all — stays with `deactivated-accounts-can-still-be-invited-or-added` |
| `memberships-end-in-frozen-projects-untested` | [4b](./step-4b-review.md) | One test: Ana's membership in a project being deleted ends when she deletes her account. Shown to be watching by adding the delete-mode check to `deleteAccount`'s loop, which turns it red with "the project is being deleted" |
| `routines-must-cascade-with-the-account` | [design §6](./design-decisions.md) | Migration `019` gives `routines.user_id` `on delete cascade`, and `completions` cascades from `routines`, so `purgeDeletedAccounts` takes both. One test purges an account and finds neither left |
| `due-date-writer-ignores-delete-mode` | Code review, 2026-10-03, against [C §4](./slice-c-review.md) | `setTaskDueDate`'s `update` filtered `tasks` on `deleted_at is null`, so it went on changing dates — and clearing subtask dates past the new one — in a project being deleted. Slice B's review said it went through the view and slice C's counted it among the writers the view protected; neither had read the `where` clause. It now selects through `visible_tasks`, the shape `setTaskNotes` uses. One test, which fails against the old clause with the promise resolving `{ clearedSubtasks: 1 }` |
| `writes-cannot-report-no-such-row` | [A §4](./slice-a-review.md), [B §5](./slice-b-review.md) | `deleteTask` was the last writer that could not tell "done" from "no such row". It now throws on a row count of zero |
| `deleted-task-still-editable` | [B §5](./slice-b-review.md) | `setSubtaskNotes` now requires its subtask's `task_id` to be among `visible_tasks`, and both notes writers throw on a row count of zero. Four tests, each seen failing first |
| `move-task-across-projects` | [B §5](./slice-b-review.md) | `moveTask` refuses unless the task and both neighbours share a project — `eee74db` |
