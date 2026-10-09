# Step 4b — review

Written 2026-10-08, after step 4b was built and passing: transfer of leadership, account deletion,
and the tests moved into `src/test_queries`. Migration 018, one hundred and twenty-eight tests.
Companion to [`design-decisions.md`](./design-decisions.md), [`learning-path.md`](./learning-path.md)
and the three slice reviews — [`slice-a-review.md`](./slice-a-review.md),
[`slice-b-review.md`](./slice-b-review.md), [`slice-c-review.md`](./slice-c-review.md).

Reads the same way as the slice reviews. Every piece gets **Protects**, **Doesn't protect** and
**Assumes**, and every rule is either a **lock** — in the database, refusing bad data from anywhere —
or a **sign**, in our code, which only works for writes that go through it.

**This file does not track status.** It is dated. Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**As in every review so far, nothing here came from a failing test.** All 128 pass, in file order
and in three shuffled orders. What is different this time is how the claims were checked. Two
earlier reviews listed `setTaskDueDate` as protected without reading its `where` clause, so every
behaviour claimed below was run against `taskco_test` in a throwaway copy before it was written
down — including the three that only show when two operations meet.

---

## Everything this review raised

| # | Name | Open item | Where |
|---|---|---|---|
| 1 | `transfer-accepts-an-account-being-deleted` | A project can be handed to an account being deleted, and that account then outlives its own date | `transferLeadership` |
| 2 | `memberships-end-in-frozen-projects-untested` | The decision that account deletion ends memberships even in a project being deleted has no test | tests |
| 3 | `concurrent-transfer-reads-as-project-not-found` | A transfer that waits on another transfer is refused as "project not found" | `transferLeadership` |
| 4 | `end-membership-errors-name-remove-member` | `endMembership`'s refusals say `removeMember:` whoever called it | `endMembership` |
| 5 | `step-4b-refusals-untested` | Six behaviours that hold, and that no test says hold | tests |

Items 1 and 2 are the two worth fixing before merging. The rest are notes.

### Deliberately allowed

- **Once an account is being deleted, its projects cannot be transferred** without reopening the
  account first: they are in delete mode, and delete mode freezes roles. Section 6 puts every
  transfer before the deletion, so this only bites someone who changes their mind — and reopening is
  the way back.
- **Account deletion ends memberships in projects that are themselves being deleted.** Decided in
  section 6: the deletion request wins.
- **Reopening brings back a project deleted on its own before the account was.** Decided in
  section 6, taking its wording literally.
- **A purged account takes its ended memberships with it**, so it leaves the membership history.
  Section 6 already accepts that "a purged user drops out of the history entirely".

---

## 1. Migration 018 — `users.deletion_scheduled_at`

**Protects** — nothing on its own. It is an ordinary nullable column with no constraint, the same as
`projects.deletion_scheduled_at`.

**Doesn't protect** — **all of account deletion is a sign.** Only `restoreProject`, `reopenAccount`
and `purgeDeletedAccounts` read the column, so every other function treats an account being deleted
as an ordinary one. That is `deactivated-accounts-can-still-be-invited-or-added`, logged in the doc
pass, and item 1 is the worst thing it leads to.

**Assumes** — that every function which should care about a departing account reads this column.

## 2. `endMembership`

**Protects**

- One place ends a membership and empties its assignments, so `removeMember`, a Lead leaving after a
  transfer, and account deletion cannot drift apart.
- It takes the caller's client, so it can only run inside a transaction someone else opened. It
  locks the membership row before checking it, so the check and the write cannot be separated.
- It still refuses the Lead, so "at least one Lead" holds for all three callers without each
  remembering it.

**Doesn't protect** — **its refusals name the wrong function.** "Membership not found" begins
`removeMember:` whoever called. Run against the database: deleting
Ana's account while a removal of Ana from Website is committing makes `deleteAccount` wait on the
lock, then find the membership already ended, and fail with `removeMember: membership not found`. The
whole deletion rolls back — correctly, and retrying works — but the message points at a function
nobody called. *(item 4)*

**Assumes** — that the caller has opened a transaction, and has made any delete-mode check it wants
first. `removeMember` does; `deleteAccount` deliberately does not.

## 3. `transferLeadership`

**Protects**

- **At most one Lead is a lock**: `memberships_one_lead_idx` refuses a second, which is why the
  demote comes before the promote. Swapping them makes two tests fail with `23505`.
- **At least one Lead is a sign**: the demote and the promote are in one transaction, so the project
  is never seen without one.
- Only a current member can be made Lead, and nobody can be made Lead of a project being deleted.
- It finds the current Lead itself, so a caller cannot name the wrong one — and a project with no
  Lead is a project that does not exist, so an unknown id is refused as "project not found" rather
  than slipping past `refuseIfProjectIsBeingDeleted`.

**Doesn't protect**

- **It does not look at the new Lead's account.** Run against the database: Ana deletes her account;
  a Lead adds her to Website, which nothing refuses; the Lead hands Website to her, which nothing
  refuses either. Ana's date passes and `purgeDeletedAccounts` skips her, because she leads a
  project — correctly, since purging her would leave Website without a Lead. So Ana is never purged,
  and Website is led by an account that is being deleted and is not itself in delete mode. Nothing
  will ever end that state. *(item 1)*
- **Two transfers at once.** Run against the database: while one transfer of Website to Ana is
  committing, a second transfer to Bruno waits on the Lead's row. When it gets the row, Postgres
  checks it again against the `where` clause, finds it no longer says `lead`, and returns nothing —
  and Ana's row was never a candidate, because the statement decided its candidates before it waited.
  The second transfer is refused as "project not found". Nothing is corrupted; the words are wrong.
  *(item 3)*

**Assumes** — that the caller is allowed to transfer. Permission arrives in step 5.

## 4. `deleteAccount`

**Protects**

- One transaction: the account's date, the dates on every project it still leads, and the end of
  every membership elsewhere land together or not at all.
- `now()` is fixed for the whole transaction, so the account and its projects share one date.
- A project already being deleted keeps its earlier date (checked against the database), and an
  account already being deleted cannot have its window extended — the precondition is in the
  `where` clause.

**Doesn't protect**

- **A membership that arrives afterwards.** Run against the database: after Ana's account deletion,
  adding her to Website succeeds, and nothing will end that membership but the purge. This is
  `deactivated-accounts-can-still-be-invited-or-added`, and it is the first step of item 1.
- **The deliberate exception has no test.** Run against the database: Ana's membership in Website
  does end even though Website is being deleted, as section 6 decided. No test says so, so the
  decision could be reversed — by someone adding the delete-mode check to `endMembership`, say —
  without anything going red. *(item 2)*

**Assumes** — that the user has already transferred whatever they meant to transfer.

## 5. `reopenAccount`

**Protects** — only inside the window, because `> now()` also refuses an account that was never being
deleted. It brings back every project the user still leads that is inside its own window, and leaves
one already past its date gone (checked against the database). Account and projects change in one
transaction.

**Doesn't protect** — the memberships elsewhere, by design: section 6's accepted asymmetry.

**Assumes** — nothing beyond its own `where` clauses.

## 6. The guard in `restoreProject`

**Protects** — a project whose current Lead has an account being deleted cannot be restored. The
check is a `not exists` inside the `update` itself, so it cannot be raced.

**Doesn't protect** — nothing it is responsible for. It is a sign, but a single-statement one.

**Assumes** — that the Lead is the one restoring. Permission arrives in step 5.

## 7. `purgeDeletedAccounts` and `npm run purge`

**Protects** — a purge never leaves a project without a Lead: anyone who still leads one is skipped.
`purge.ts` runs the project purge first, so an account and the projects it led normally go in one
run. The cascades take the account's memberships and the invites it sent.

**Doesn't protect** — an account that leads a project *not* in delete mode is skipped for ever. That
should be impossible — `deleteAccount` puts everything it leads into delete mode — and item 1 is the
one way in.

**Assumes** — that every project an account being deleted leads is itself being deleted.

## 8. The tests

**Protects** — 128, up from 117, now in seven files under `src/test_queries`, one per table. The move
was checked test by test: every one of the 121 earlier tests is present and unchanged apart from
layout and comments, except the restore test's message, which changed on purpose. **Independence is
now demonstrated:** `npx vitest run --sequence.shuffle` passed with three different seeds, which
closes `test-independence-unproven`, open since slice A.

**Doesn't protect** — six behaviours were checked against the database for this review, hold today,
and have no test: deleting an account twice; reopening an account that was never deleted;
transferring to the current Lead; transferring in a project that does not exist; a project past its
date staying gone when its Lead reopens; and an earlier project date surviving account deletion.
*(item 5)* Plus item 2, which is the one of these that pins a decision.

**Assumes** — as ever, that everything goes through `queries.ts`.

---

## The two worth fixing before merging

**Item 1 — a transfer to an account being deleted.** The narrow fix is in `transferLeadership`: read
the new Lead's account along with their membership, and refuse if it is being deleted. Locking the
membership row is enough — a concurrent `deleteAccount` of the new Lead has to end that same
membership, so the two queue on one lock either way round. The wider question, whether an account
being deleted can be invited or added at all, stays with
`deactivated-accounts-can-still-be-invited-or-added` and step 6. The narrow fix is worth having even
after that is settled, because the transfer is where the role that blocks the purge is handed over.

**Item 2 — the frozen-project exception, untested.** One test: Ana is an associate in Website,
Website enters delete mode, Ana deletes her account, and her membership has ended.

---

## Decisions this step changed or recorded

All in [`design-decisions.md`](./design-decisions.md), section 6:

- **Reopening brings back every project still led inside its window**, including one deleted on its
  own beforehand — chosen because bringing back too much costs a click and too little destroys data.
- **Transfers come before account deletion**, one at a time.
- **Account deletion ends memberships even in projects being deleted.**
- **An account is purged only once no project it leads remains** — "at least one Lead" is code, here
  as everywhere.
- **Removing a member is one helper**, `endMembership`, taking the caller's transaction.
