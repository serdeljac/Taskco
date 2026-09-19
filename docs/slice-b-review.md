# Slice B — review

Written 2026-09-18, after slice B was built and passing: tasks, subtasks, status and priority, due
dates, soft deletion, positions and notes. Migrations 007–013, fifty tests. Companion to
[`design-decisions.md`](./design-decisions.md), [`learning-path.md`](./learning-path.md) and
[`slice-a-review.md`](./slice-a-review.md).

## How to read this

Every piece gets three lines:

- **Protects** — what can no longer go wrong because this exists.
- **Doesn't protect** — what can still go wrong.
- **Assumes** — what it trusts its caller to have got right.

Every rule is one of two kinds:

- **A lock** lives in the database, and refuses bad data from anywhere — our code, a script, a
  hand-typed `psql` command.
- **A sign** lives in our code, and only works for writes that go through that code.

Signs are not mistakes. Some rules cannot be locks. But it matters to know which is which, because
anything that writes to the database without going through `queries.ts` walks straight past a sign.

As with slice A, **nothing here came from a failing test.** All fifty pass. These were found by reading
each piece and asking what it actually guarantees.

**Follow-up, 2026-09-18.** Items 2 and 3 were fixed before merging, test-first. The Status column below
is current; the sections after it describe the code as it was reviewed.

---

## Everything open, in one place

| # | Open item | Where | Status |
|---|---|---|---|
| 1 | Writes don't check who is asking | `queries.ts` | Open — step 5 |
| 2 | A deleted task can still be changed | `queries.ts` | **Fixed** — writes find their task through the view |
| 3 | `moveTask` doesn't check that the task and its neighbours share a project | `moveTask` | **Fixed** — refuses a move across projects |
| 4 | The 50-subtask limit is a sign, and two simultaneous creates can both get under it | `createSubtask` | Open |
| 5 | "Not due after its task" is a sign | `refuseDueDateAfterParent` | Open |
| 6 | "Not before today" is not built yet | design, step 6 | Open — step 6 |
| 7 | `users.timezone` accepts any text, and items 5 and 6 will lean on it | `002`, from slice A | Open |
| 8 | Positions can repeat or go negative | `011`, `createTask`, `createSubtask` | Open |
| 9 | Nothing makes a query read through the views | `010`, `012` | Open |
| 10 | Write functions can't tell "done" from "no such row" | `queries.ts` | Partly — the fixes for item 2 report a missing task |
| 11 | No functions for changing status or priority yet | `queries.ts` | Open — step 5 |
| 12 | `deleted_at` can be before `created_at`, or in the future | `010`, `012` | Open |
| 13 | Titles and notes have no length limit | `007`, `012`, `013` | Open |
| 14 | Three names no longer say what they mean | cosmetic | Open |

**Items 2 and 3 are worth fixing before slice B is merged.** Both are small, and both are real bugs
that no test notices. The rest are notes, most of them waiting for step 5 or step 6.

### Deliberately allowed

Not problems — decisions, written down so they are not rediscovered as problems later.

- **Duplicate task titles.** "Write the copy" twice in one project is reasonable. If that changes, a
  partial unique index on `(project_id, lower(title)) where deleted_at is null` adds the rule.
- **A task due in the past.** The design limits *subtask* dates, not task dates.
- **A deleted task's subtasks stay in the table.** They are hidden by the views, not removed, so
  restoring the task would bring them back with it.

---

## 1. The `tasks` table — migrations 007, 008, 009, 010, 011, 013

**Protects**

- Every task belongs to a real project (`tasks_project_id_fkey`), and goes with it if the project is
  ever truly deleted.
- No blank title, no blank notes, no status or priority outside the list — all locks.
- A due date is a calendar day with no time and no timezone.
- Every task has a position.

**Doesn't protect**

- Two tasks can share a position, and a position can be negative. Order then falls back to `id`.
  *(item 8)*
- `deleted_at` can be earlier than `created_at`, or in the future — the same gap memberships have.
  *(item 12)*
- Titles and notes can be any length. *(item 13)*

**Assumes** — nothing. Everything above is either a lock or openly allowed.

## 2. The `subtasks` table — migrations 012, 013

**Protects**

- Every subtask belongs to a real task, and goes with it on a true delete. Deleting a project removes
  its tasks, and removing each task removes its subtasks — two hops.
- **One level only, by shape.** Nothing points at `subtasks`, so a subtask cannot have children. No
  rule enforces this; there is nowhere to put one.
- **A subtask cannot disagree with its task about its project**, because it does not store one. The
  project is always found through the task.
- The same locks as tasks: title, notes, status, priority.

**Doesn't protect**

- More than fifty subtasks, or a date after the parent's — both are signs in code. *(items 4, 5)*

**Assumes** — that every write goes through `createSubtask` and `setSubtaskDueDate`.

## 3. The views — `visible_tasks`, `visible_subtasks`

**Protects** — a query that reads through them never sees a deleted row, and never has to know what
"deleted" means. `listSubtasks` joins both, so a deleted task's subtasks disappear too.

**Doesn't protect** — a query that reads `tasks` or `subtasks` directly sees everything. "Reads go
through the views" is a convention, not a lock. *(item 9)*

**Assumes** — that each view is re-created whenever its table gains a column, because `select *` is
fixed when a view is made. Done twice so far, in `011` and `013`.

## 4. `src/db.ts` — the date rule

**Protects** — every `date` column arrives as text, `"2026-09-18"`, never as a moment in the
machine's timezone. Because every file reads through this pool, it holds everywhere.

**Doesn't protect** — nothing it is responsible for. `timestamptz` columns still arrive as `Date`,
which is right: those are moments.

**Assumes** — that no file creates a database connection of its own.

## 5. `src/queries.ts`

### `createTask`

- **Protects:** a new task always lands at the end of its project's list, spaced 65536 after the last.
- **Doesn't protect:** two tasks created at the same instant can both read the same "last" position
  and share it. *(item 8)* Anyone can create a task — nothing checks the caller is the Lead. *(item 1)*
- **Assumes:** the project exists — safe, because the database refuses otherwise (`23503`).

### `listTasks`

- **Protects:** only *current* members of the project see its tasks. Deleted tasks are never shown.
  Other projects' tasks never leak in.
- **Doesn't protect:** it believes whatever `userId` it is handed. Pass someone else's id and you see
  their view. Until step 6 there is no session to take the real id from.
- **Assumes:** the caller passes the id of the person actually asking.

### `deleteTask`

- **Protects:** the row is kept, with the moment it was deleted. Deleting twice keeps the first time.
- **Doesn't protect:** it can't report whether anything was deleted. *(item 10)*
- **Assumes:** the caller is allowed to delete. *(item 1)*

### `moveTask`

- **Protects:** a move writes one row when there is room. When there isn't, the project is renumbered
  inside one transaction, so a list is never half-renumbered. Works between two tasks, at the top and
  at the bottom.
- **Doesn't protect:**
  - **It never checks that the task and its neighbours are in the same project.** Moving a task
    "between" two tasks of another project gives it a position that only means something over there —
    and if that project gets renumbered, the task's number is rewritten as part of a list it isn't
    in. *(item 3)*
  - It looks neighbours up in `tasks`, not the view, so a deleted task can serve as a neighbour, and a
    deleted task can itself be moved. *(item 2)*
  - Two moves at the same moment can each work from what they read and overwrite each other.
- **Assumes:** the neighbours are the task's real neighbours in the list the person was looking at.

### `createSubtask`

- **Protects:** no 51st subtask, and no date after the parent's — *through this function*.
- **Doesn't protect:**
  - A hand-written insert passes both rules. *(items 4, 5)*
  - Two subtasks created at the same instant can both count 49 and both be saved. *(item 4)*
  - **It adds subtasks to a deleted task without complaint.** They are hidden immediately, because
    the task is. *(item 2)*
- **Assumes:** the task exists — safe, the database refuses otherwise.

### `listSubtasks`

- **Protects:** the same as `listTasks`, reached through the parent task — current members only, and
  nothing deleted, whether the subtask or its task was the one deleted.
- **Doesn't protect / assumes:** the same `userId` trust as `listTasks`.

### `setSubtaskDueDate`

- **Protects:** a changed date can't be after the parent's; `null` clears it to "TBD"; a deleted
  subtask can't be edited.
- **Doesn't protect:** a subtask whose *task* was deleted can still be edited. *(item 2)*
- **Assumes:** the caller is allowed to change dates. *(item 1)*

### `setTaskDueDate`

- **Protects:** the task's new date and the clearing of any subtask dates past it happen together or
  not at all. It reports how many it cleared, which is what the Lead's confirmation prompt needs.
- **Doesn't protect:** **a deleted task's date can still be changed** — and changing it clears its
  subtasks' dates too. *(item 2)*
- **Assumes:** the caller is allowed to change dates. *(item 1)*

### `setTaskNotes`, `setSubtaskNotes`

- **Protects:** blank text becomes empty, so there is one way to store "no notes"; deleted items
  can't be edited.
- **Doesn't protect:** can't report whether the row existed. *(item 10)*
- **Assumes:** the caller is allowed to edit notes.

## 6. The tests

**Protects** — fifty tests, grouped by what they are about: users, projects, memberships, tasks,
subtasks, and the test-database guard. Every refusal test names the rule it expects to refuse.

**Doesn't protect** — nothing tests the gaps above, because tests were written for the behaviour that
was intended. None of items 2, 3 or 4 would turn a test red today.

**Assumes** — that everything goes through `queries.ts`, which is exactly what makes signs look like
locks from inside the test suite.

---

## The two worth fixing before merging

**Item 2 — a deleted task can still be changed.** `setTaskNotes` and `setSubtaskNotes` refuse to touch
deleted rows. `setTaskDueDate`, `moveTask`, `createSubtask` and `setSubtaskDueDate` don't. A fix
makes them consistent: a deleted task, and everything under it, is read-only until restored.

**Item 3 — `moveTask` across projects.** A fix checks that the task and both neighbours belong to the
same project, and refuses otherwise.

Both follow the usual rhythm: a test that fails, then the change that makes it pass.

**Both are fixed.** `setTaskDueDate`, `createSubtask`, `setSubtaskDueDate` and `moveTask` now find their
task through the view and refuse with "not found" if it is deleted; `setTaskDueDate` does it with the
update's own row count, before any subtask is touched. `moveTask` also refuses unless the task and its
neighbours share a project, and renumbers the moved task's own project. Six new tests, each seen
failing before its fix — fifty-six in all.

---

## Other notes

- **Item 1** is the design working as planned. Reads have taken a user id since slice A. Permission
  checks on writes — Lead-only, and Associates limited to status and notes — are built in step 5.
- **Item 11:** the seed script and the tests set status and priority with raw SQL, because no
  function does it yet. Those arrive with the HTTP layer, alongside permission checks.
- **Item 14:** the test `"lists a project's tasks, oldest first"` is now ordered by position, not age;
  `deleteTask(taskID)` is the only id spelled `ID`; migration `012` is named `create_subtask` for a
  table called `subtasks`. The migration name can't change, because it is applied. The other two can.
- **Still open from slice A:** `listProjectsForUser` has no tiebreaker on its `order by`; the
  `lower(email)` lookup rule; `removeMember` ignoring its row count; `.env.example` not mentioning
  `.env.test`.

---

## Decisions this slice changed or recorded

All in [`design-decisions.md`](./design-decisions.md):

- **The assignee is deferred out of slice B.** It can arrive later as an empty-able column, with
  nothing to fill in.
- **Priority is stored empty and shown as "Not set"**, the same rule as "TBD" for dates.
- **Dates arrive in JavaScript as text**, because `pg` otherwise turns a calendar day into a moment on
  the machine's clock.
- **One view decides what is visible**, rather than a filter in every query.
- **Positions:** `moveTask` names the neighbours a task lands between; either may be left out.
- **The subtask due-date rule lives in code**, in one helper; a trigger was considered and rejected.
  The "not before today" half waits for step 6.
- **Notes were in the design and missing from the schema.** Found during this review; added as a column
  on both tables.
