# Slice C — review

Written 2026-09-30, after slice C was built and passing: the assignee, invites, and project delete
mode. Migrations 015–017, one hundred and ten tests. Companion to
[`design-decisions.md`](./design-decisions.md), [`learning-path.md`](./learning-path.md),
[`slice-a-review.md`](./slice-a-review.md) and [`slice-b-review.md`](./slice-b-review.md).

Reads the same way as the slice B review. Every piece gets **Protects**, **Doesn't protect** and
**Assumes**, and every rule is either a **lock** — in the database, refusing bad data from anywhere
— or a **sign**, in our code, which only works for writes that go through it.

**This file does not track status.** It is dated. Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**As in both previous slices, nothing here came from a failing test.** All 110 pass. These came from
reading each piece and asking what it actually guarantees.

---

## Everything this review raised

| # | Name | Open item | Where |
|---|---|---|---|
| 1 | `scheduled-deletion-never-happens` | Nothing ever removes a project whose thirty days have passed | delete mode |
| 2 | `accept-can-collide-with-membership` | `acceptInvite` inserts without checking they have not become a member meanwhile | `acceptInvite` |
| 3 | `unacceptable-invites-are-still-listed` | `listInvitesForUser` shows invites to projects being deleted | `listInvitesForUser` |
| 4 | `delete-mode-helper-passes-unknown-projects` | The helper treats "no such project" as "not being deleted" | `refuseIfProjectIsBeingDeleted` |
| 5 | `delete-now-refusal-untested` | `deleteProjectNow` refuses a project already in delete mode; no test says so | tests |
| 6 | `restore-ignores-the-leads-account` | Section 6 allows undo only while the Lead's account is active | design, step 4b |
| 7 | `views-now-join-projects-on-every-read` | Both views join `projects`, and `visible_subtasks` joins two tables | `017` |
| 8 | `expired-invites-are-never-removed` | Nothing deletes an expired invite except a re-invite to the same address | `invites` |
| 9 | `delete-mode-notifies-nobody` | Section 6 says members get a notification of the project's status | design, step 5 |

Items 1 and 2 are the two worth fixing before moving on. The rest are notes, most of them waiting
for a later step.

### Deliberately allowed

- **Declining an invite works while the project is being deleted.** Declining destroys a row and
  grants nothing. Refusing it would leave the recipient holding an invite they can neither accept
  nor get rid of.
- **An invite survives its project entering delete mode.** The acceptance is refused and the
  transaction rolls back, so restoring the project finds the invite still waiting — which is the
  behaviour the thirty-day window exists to give.
- **A subtask's assignee is only checked in code.** Recorded in section 7 and logged as
  `subtask-assignee-project-check-is-a-sign`.

---

## 1. The assignee — migration 015

**Protects**

- **A task cannot be assigned into another project.** The composite foreign key on
  `(assignee_membership_id, project_id)` against `memberships (id, project_id)` refuses it from
  anywhere — our code, a script, a hand-typed `psql` command. This is a lock.
- Deleting a membership empties the assignee rather than deleting the task, because
  `on delete set null` names the one column to empty. Cascade would have taken the task with it.
- A subtask's assignee at least refers to a membership that exists.

**Doesn't protect**

- **A subtask can be assigned into another project.** Its foreign key has no `project_id` to pair
  with, deliberately, so only `refuseUnlessCurrentMember` stands there.
- **Nothing stops an assignee who has left.** Leaving sets `ended_at` and the row stays, so every
  key remains satisfied. Two signs hold this: the helper on the way in, and `removeMember` clearing
  on the way out.

**Assumes** — that every assignment goes through `setTaskAssignee`, `setSubtaskAssignee`,
`createTask` or `createSubtask`, and that nothing ends a membership except `removeMember`.

## 2. Invites — migration 016

**Protects**

- One invite per project per address, case-insensitively, by a unique index on
  `(project_id, lower(email))`. A lock.
- No blank address, and an expiry that cannot fall before creation.
- Every invite belongs to a real project and a real sender, and goes with either if they are truly
  deleted.
- **Two states cannot disagree**, because there is only one: a row existing is the invite pending.

**Doesn't protect**

- **Nothing removes an expired invite.** It sits in the table holding its slot in the unique index
  until someone re-invites that address, which is the only thing that deletes it. *(item 8)*
- The address is not checked for shape or length, the same gap `users` has.

**Assumes** — that every invite is written by `createInvite`, which is what deletes the previous
one. A hand-written insert would be refused by the index rather than replacing anything.

## 3. Delete mode — migration 017

**Protects**

- Setting the date makes a project's contents unwritable through fifteen functions: seven refuse
  because they read through the views, five through `refuseIfProjectIsBeingDeleted`, one through
  an `insert ... select ... where exists`, and two — the notes writers — through the views again.
- Associates stop seeing the project. The Lead keeps seeing it, with its date.
- `deleteProject` cannot extend a window already running, and `restoreProject` cannot clear a date
  that is not set. Both put the precondition in the `where` clause, so neither can be raced.

**Doesn't protect**

- **The thirty days do nothing.** Nothing in the project ever removes a project whose date has
  passed. Delete mode is, today, a state a project enters and stays in. *(item 1)*
- **All of it is a sign.** The date is an ordinary nullable column and no constraint refers to it.
  A write that does not go through `queries.ts` ignores delete mode entirely.
- Nobody is told. Section 6 says members get a notification; there are none. *(item 9)*

**Assumes** — that the helper is called before every write that does not read through a view, and
that nobody adds a writer without noticing which of the two kinds it is.

## 4. The views, re-created

**Protects** — this is the slice's best result. Seven writers started refusing a project being
deleted **without being edited**: `moveTask`, `setTaskDueDate`, `createSubtask`,
`setSubtaskDueDate`, `setTaskAssignee`, `setSubtaskAssignee` and `setSubtaskNotes`. Slice B's
decision that "one place decides what is visible" was argued; here it paid.

**Doesn't protect** — `setTaskNotes` filtered the table directly and silently kept writing until a
test caught it. That is `nothing-forces-reads-through-views`, demonstrated rather than predicted.

**Assumes** — that both views are re-created whenever either table gains a column, and that
`visible_subtasks`'s two joins stay in step with `visible_tasks`'s one. *(item 7)*

## 5. `refuseIfProjectIsBeingDeleted`

**Protects** — the check and the write cannot be separated by a concurrent `deleteProject`, because
`for share` holds the project row until the caller commits while still letting other readers
through. `for update` would have serialised every task creation in a project against every other.

**Doesn't protect** — **a project that does not exist passes the check.** `rows[0]?.x` on an empty
result is `undefined`, which is falsy, so the helper returns quietly and the caller's write fails
later on a foreign key instead. The name promises more than the code delivers. *(item 4)*

## 6. `refuseUnlessCurrentMember`

**Protects** — both halves of "must be a current member" for a task, and the only half available
for a subtask. It locks the membership row, so a `removeMember` cannot commit between the check and
the write.

**Doesn't protect** — nothing it is responsible for. It takes `for update` where `for share` would
do, which is stricter than needed rather than wrong, and logged.

## 7. `acceptInvite`

**Protects** — an invite belonging to someone else does not match at all, so "not yours" and "not
found" are one answer and neither reveals the other. Expiry is computed at the moment of asking.
The membership and the deletion of the invite are one transaction. A second acceptance blocks on
`for update of i`, then finds the row gone.

**Doesn't protect** — **it does not check whether the recipient is already a member.** `createInvite`
refuses inviting one, but a Lead can add someone directly after the invite is sent, and accepting
then raises `23505` from `memberships_one_active_idx` — the right refusal wearing the wrong words,
and the exact problem the already-a-member check was added to `createInvite` to avoid. *(item 2)*

## 8. The tests

**Protects** — 110, up from 95. The delete-mode tests assert the write did not happen as well as
that it was refused: a membership count unchanged, a `deleted_at` still null, an invite still there.

**Doesn't protect** — three gaps. `deleteProjectNow`'s refusal of a project already in delete mode
is specified and untested *(item 5)*. Nothing exercises a subtask assignee written straight to the
table, which is where the missing lock would show. And every test drives the functions that hold
the signs, which is what makes a sign look like a lock from inside the suite.

---

## The two worth fixing before moving on

**Item 1 — the thirty days do nothing.** A project enters delete mode and stays there. Everything
built this slice is the *front half* of a feature whose back half does not exist, and the design
says plainly: "30 days, then the project and all its data are removed." It needs deciding rather
than just building — a swept job is the obvious answer and the design has avoided sweeps everywhere
else, deriving state instead. Derivation cannot help here, because deletion is destruction, not a
question about stored facts.

**Item 2 — `acceptInvite` and an existing membership.** One extra check in a transaction that is
already there, and it turns a raw `23505` into a sentence.

---

## Decisions this slice changed or recorded

All in [`design-decisions.md`](./design-decisions.md):

- **How "an assignee must be a current member" is enforced** — the last genuine open question, and
  it split into a lock and a sign exactly as "exactly one Lead" did.
- **An invite offers no role, and has no status column.** Both were in the design and both could
  only ever hold one value.
- **The expiry is stored, not computed.** A value is only safe to derive if every input is stored,
  and `created_at + 3 days` hides the `3`.
- **The email is compared lowered** in three places, which is where migration 002's index finally
  got a customer.
- **Section 4 and section 6 disagreed about delete mode**, and section 6 won: the date governs the
  project's contents, the Lead keeps its lifecycle.
- **Project visibility cannot live in a view**, because it depends on who is asking. Task visibility
  can, because it does not. The pattern from slice B does not generalise, and the reason is worth
  more than the rule.
