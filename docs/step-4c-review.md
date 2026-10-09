# Step 4c — review

Written 2026-10-09, after step 4c was built and passing: routines, completions, the `user_today`
view, and streaks. Migration 019, one hundred and forty-six tests. Companion to
[`design-decisions.md`](./design-decisions.md), [`learning-path.md`](./learning-path.md) and the
earlier reviews — [`slice-a-review.md`](./slice-a-review.md), [`slice-b-review.md`](./slice-b-review.md),
[`slice-c-review.md`](./slice-c-review.md), [`step-4b-review.md`](./step-4b-review.md).

Reads the same way as the others. Every piece gets **Protects**, **Doesn't protect** and
**Assumes**, and every rule is either a **lock** — in the database, refusing bad data from anywhere —
or a **sign**, in our code, which only works for writes that go through it.

**This file does not track status.** It is dated. Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**As with step 4b, every behaviour claimed here was run against `taskco_test`** in a throwaway copy
before it was written down — except one, item 4, which is marked as reasoned. And as in every review,
nothing here came from a failing test: all 146 pass.

---

## Everything this review raised

| # | Name | Open item | Where |
|---|---|---|---|
| 1 | `timezone-accepts-any-text` | Already open since slice A. One bad timezone now breaks every routine read for that user, and any read of *everyone's* today | `users`, `user_today` |
| 2 | `docs-say-a-check-cannot-call-now` | Seven passages say a `CHECK` cannot use `now()`. Postgres accepted one, and it refused a future moment | docs |
| 3 | `routine-refusals-untested` | Four behaviours hold and have no test | tests |
| 4 | `two-tests-read-today-twice` | Two tests work out today separately from the function they check, so a midnight in Zagreb between the two would fail them | tests |

Items 1 and 2 are the two worth fixing before merging. Two items already open gained evidence:
`weekday-numbering-written-twice` and `deactivated-accounts-can-still-be-invited-or-added` — see
sections 5 and 3.

### Deliberately allowed

- **Two routines can share a name.** "Stretch" twice is the owner's business, the same decision as
  duplicate task titles in slice B.
- **A routine can be completed on a day it is not scheduled.** Run against the database: Ana completes
  a routine that is not due today; it shows `done_today` true, `due_today` false, and a streak of 0.
  That is rule 5 — kept, not counted.
- **An account's routines survive its deletion window**, and go with the account when it is purged.
  Reopening the account finds them where they were.

---

## 1. The tables — migration 019

**Protects** — all locks:

- A routine has a non-blank name and at least one day, and every day is 1 to 7.
- A routine belongs to a real user and goes with them; a completion belongs to a real routine and
  goes with it.
- **A day cannot be recorded twice**, because `(routine_id, done_on)` is the primary key.

**Doesn't protect**

- **That a completion is dated today.** That is a sign, in `completeRoutine`. A hand-written insert
  can date one anything. `countStreak` copes with both directions: it starts at today, so a date
  after today is never looked at, and it stops at the start day, so a date before the routine
  existed is never counted.
- That `weekdays` holds each day once. `{1, 1, 2}` passes the check. It is harmless, because every
  reader asks "is this day in the list", and the answer is the same.

**Assumes** — that every completion is written by `completeRoutine`.

## 2. `user_today`

**Protects** — one place says what today is for each user, and it is fresh on every read, so nothing
has to be reset at anyone's midnight. Every routine function reads through it.

**Doesn't protect** — **a timezone Postgres does not recognise.** Run against the database, with Ana
in `Europe/Zagreb` and a second user in `Mars/Olympus`:

- Ana's routines list, complete, undo and count as normal. A bad row does not touch reads that filter
  to someone else.
- The Mars user's `listRoutines` fails with `22023 time zone "Mars/Olympus" not recognized`.
- **A read of everyone's today — `select user_id, today from user_today` — fails for everyone**, with
  the same error. Nothing reads it that way yet. A reminder job, or anything that asks "whose day is
  ending", would.

This is `timezone-accepts-any-text`, logged in slice A as a lie about data. It is now a failure that
one user's row can cause for every user. *(item 1)*

**Assumes** — that every `users.timezone` is a name Postgres knows.

## 3. `createRoutine` and `listRoutines`

**Protects** — a routine is created for the user named, and listed only to them, oldest first, with a
tiebreaker. "Due today" and "done today" are derived in the same statement as the list.

**Doesn't protect** — **an account being deleted.** Run against the database: after `deleteAccount`,
the same user can still create a routine and complete it. Nothing reads the account's date here,
which is `deactivated-accounts-can-still-be-invited-or-added` again — that item now covers routines
as well as projects.

**Assumes** — that the caller is the owner. Identity arrives with step 6.

## 4. `completeRoutine` and `undoCompletion`

**Protects**

- The caller never supplies a date. `completeRoutine` reads today for the owner and returns the date
  it used.
- A second completion that day does nothing, rather than raising `23505`.
- `undoCompletion` removes today's row and nothing else; yesterday cannot be undone.
- Both refuse a routine that is not the caller's. Run against the database: undoing someone else's
  routine is refused — with "not completed today", which is true of the asker and says nothing about
  whether the routine exists.

**Doesn't protect** — nothing it is responsible for. The two statements in `completeRoutine` are not
a transaction, and do not need to be: the insert uses the date the first statement read, so a midnight
between them records the day the tap happened.

**Assumes** — nothing beyond its own `where` clauses.

## 5. `countStreak` and `getStreak`

**Protects** — the five rules agreed before the code was written, each with a test that fails when its
line is removed (checked while the step was built). The rule takes plain values, so its tests use
fixed dates and give the same answer on any day. `getStreak` reads the start day and today in one
statement, both on the owner's calendar.

**Doesn't protect** — **anything that holds the two weekday numberings together.**
`extract(isodow …)` decides "due today" in SQL; `isoWeekday` decides "scheduled" in `streak.ts`. Run
against the database across forty-two days — three fortnights, taking in October's change of clocks,
a new year, and Europe's change in March — they agree on every one. Nothing would notice if one of them changed. That is
`weekday-numbering-written-twice`, which a test comparing them on the same dates would close.

**Assumes** — that `today` is never before `started`. It cannot be while both come from the same
timezone in the same statement, which they do.

## 6. The tests

**Protects** — 146, up from 130, in nine files. The timezone test pairs Kiritimati with Pago Pago,
twenty-five hours apart, so it cannot pass by luck on any day.

**Doesn't protect**

- **Four behaviours with no test,** all checked against the database for this review: a routine with
  a blank name is refused (`routines_name_not_blank`); undoing when nothing was done today is refused;
  undoing someone else's routine is refused; and a completion on an unscheduled day is recorded,
  shown as done today, and not counted. *(item 3)*
- **Two tests read "today" twice.** "Says whether a routine is due today" works out today's weekday,
  then calls `listRoutines`, which works it out again; "counts a streak from the owner's own today"
  writes completions relative to today, then calls `getStreak`. If Zagreb's midnight falls between
  the two reads, each test fails although the code is right. **Reasoned, not run** — the clock cannot
  be moved from a test. It would take a run that straddles midnight in Zagreb — around 15:00 in Los
  Angeles — to see it. *(item 4)*

**Assumes** — as ever, that everything goes through `queries.ts`.

## 7. What the docs say about `CHECK` and `now()`

Not step 4c's code, but found while choosing a fix for item 1, and it changes what the project
believes it can do.

Seven passages — in `design-decisions.md` section 5, `learning-path.md` twice, `open-items.md`,
`reference.md` twice, and `slice-a-review.md` — say a `CHECK` cannot refuse a future date because a
check expression must be immutable and `now()` is not. **Run against the database, inside a
transaction that was rolled back:** Postgres accepted `check (x <= now())`, let a past moment in, and
refused a future one with `23514`. *(item 2)*

What is true is narrower, and worth having exactly:

- **An index predicate must be immutable, and Postgres enforces it.** The same run refused
  `create index … where x > now()` with `42P17 functions in index predicate must be marked IMMUTABLE`.
  So the invites decision in section 5 — no partial index on unexpired invites — stands.
- **A `CHECK` cannot contain a subquery, and Postgres *assumes* its answer never changes for the same
  row — but does not enforce it.** A check is run when a row is written and never again. A function
  inside it may read the clock, or another table, and Postgres will not go back over old rows when
  either changes.
- **So a check that reads something changing is safe only when its answer cannot flip.** "Not in
  the future" cannot: a moment that was not in the future when written never becomes so, because time
  only moves forward. "The parent row exists" can — which is why that rule is a foreign key and not a
  check.

That reopens `soft-delete-timestamps-unchecked` as fixable: `ended_at <= now()` and
`deleted_at <= now()` can be locks.

---

## The two worth fixing before merging

**Item 1 — make the timezone a lock.** Run against the database inside a rolled-back transaction: a
`CHECK` calling a small function that asks Postgres's own list, `pg_timezone_names`, refused
`Mars/Olympus`, `UTC+3` and `europe/zagreb`, and accepted `Europe/Zagreb`, `UTC`,
`America/Los_Angeles` and `EST`. Its answer can only flip if a Postgres upgrade drops a timezone name,
which the timezone database tries hard not to do, keeping retired names as links to their successors. **The cost is speed**: each insert
into `users` took about 20 ms, the first about 100. Almost every test creates one or two users, so the
suite would slow by a few seconds; that trade belongs in the fix's specification, alongside the
alternative of checking the name in `createUser` instead, which is a sign.

**Item 2 — correct the seven passages,** and decide whether migration 020 also gives
`soft-delete-timestamps-unchecked` its two checks, since the same migration is already being written.

---

## Decisions this step changed or recorded

All in [`design-decisions.md`](./design-decisions.md), sections 8 and 9:

- **A routine's rule is a set of weekdays**, 1 for Monday to 7 for Sunday.
- **The server dates every completion**, on the owner's calendar; a second completion that day does
  nothing; undo reaches today only.
- **"Today" has one home**, the `user_today` view.
- **A streak follows five rules**, and is computed by a pure function that never touches the database.
- **Routines go with the account.**
