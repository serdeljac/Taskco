# Taskco — Design Decisions

**Status:** in progress. Last updated 2026-09-01 (task ordering).

A running record of what has been decided, what is still open, and why. Decisions are added
here as they are made, not reconstructed afterwards. When an open question gets answered, it
moves up into the decided sections.

Nothing here has been implemented. No stack has been chosen.

---

## 1. What Taskco is

A task-management web app where multiple people collaborate on shared projects.

Any user can create a project. The creator becomes its **Lead** and can invite others, who join
as **Associates** with limited control.

Built primarily as a vehicle for learning how to plan software, so the reasoning behind each
decision is a deliverable alongside the code.

---

## 2. The shape of the data

Five kinds of record:

| Record | Belongs to | Notes |
|---|---|---|
| **User** | — | A person with an account. |
| **Project** | — | Created by a user, who becomes Lead. |
| **Membership** | user + project | One record per person-per-project. Holds the role. |
| **Task** | one project | |
| **Subtask** | one task | One level deep only. Max 50 per task. |

**Membership is a join table.** Users and projects are both top-level; neither is nested inside
the other. The role lives on the membership because it belongs to neither side — you can be a
Lead on one project and an Associate on another.

Users are referenced by an internal id that never changes. Never by email or name.

---

## 3. Users, projects, membership

- Any user can create a project. The creator is the Lead.
- The Lead **is a member**, with role = lead. Not a separate list.
- One membership per person per project, enforced by a database constraint.
- No subscription tiers. Considered and deliberately dropped — billing would have added a payment
  provider, asynchronous plan state, a second authorization system, and the downgrade problem,
  none of which serve the goal of this project.
- "Solo" is not a project type. It is a project that currently has one member. The rule underneath
  is the same in both cases: an assignee must be a member of the project.

---

## 4. Permissions

Permission depends on three things: the person's **role**, whether they are the **assignee of that
specific row**, and the **project's lifecycle state**. It is row-level, not role-level — you cannot
answer "can this user edit tasks?" without knowing which task.

| Who | On a task | On a subtask |
|---|---|---|
| Lead | Full control | Full control |
| Associate, assigned | Same as Lead *(see open question 5, 6)* | Status and notes only |
| Associate, not assigned | Read only | Read only |
| Any member, project pending deletion | No access | No access |

All permissions are enforced on the server. Hiding a button in the interface is a courtesy to the
user, not security.

---

## 5. Invites

An invite is **its own record**, not an event — it waits, it has a state, it can expire, so it
needs somewhere to exist.

It holds: the project, the recipient's email, the sender's user id, the role offered, when it was
created, when it expires, and its status.

- **Targeted, not an open link.** The Lead selects a specific user by email address.
- Only existing Taskco users can be invited. If no account matches: "No email found."
- Expires **3 days** after creation.
- **The server sets all timestamps.** The client sends intent; the server derives facts.
- Expiry is **derived**, not swept by a background job: an invite is expired if it is still pending
  and its expiry date has passed.
- **One pending invite per project per email address**, enforced by a database constraint.
- Accepting sends the *invite id*, never a project name and never the user's own identity. The
  server takes identity from the session, then checks the invite is pending, addressed to that
  person, and unexpired.
- **Declined or expired:** destroyed silently, no notification.
- **Accepted:** status set to confirmed, Lead notified, then destroyed.

The recipient is stored as an email rather than a user id because an invite may eventually be
addressed to someone who has not registered yet. This is the one place email is the correct
reference. The membership created on acceptance stores the user id.

*Accepted consequence:* because declined and expired invites are both destroyed, the Lead cannot
tell "they refused" from "they never looked."

*Accepted consequence:* because accepted invites are destroyed, there is no record of who invited
whom.

---

## 6. Leaving, transferring, deleting

### Transfer of leadership
- The Lead may transfer to any user. The recipient has 3 days to accept.
- On acceptance the recipient becomes Lead, and the previous Lead is **removed from the project
  entirely** — they must be re-invited to return.
- Other members' roles are unaffected.

### Removing a member
One shared operation, called by every path that removes someone — transfer, account deletion, or a
Lead removing an associate.

- Any task or subtask they were assigned to has its assignee set to **None**.
- This maintains the invariant: *an assignee must be a current member of the project.*

### Deleting a project
- The Lead is prompted, then a **5-day** countdown begins.
- **The Lead can cancel at any time during the window.**
- During the window: the Lead cannot transfer, and associates lose all access — they see only a
  notice with the project name and its deletion date, telling them to contact the Lead.
- After 5 days the project and all its data are removed.

### Deleting an account
- Same as above, but **30 days**.
- If the user reopens their account during the window, the countdown is cancelled.
- This means "delete account" is really deactivation followed by a purge.

### Export
- The Lead can export the project's tasks to **CSV at any time**. The delete confirmation mentions
  this.
- Associates cannot export. They must ask the Lead for the file.

---

## 7. Tasks and subtasks

### Fields
Due date, notes, and priority are all optional. Plus status and assignee.

### Status
Four values: **Not Started**, **In Progress**, **On Hold**, **Completed**.

- *On Hold* means the task must wait before being worked on.
- Task status does **not** cascade to subtasks.

### Omit
**Omit is a flag, not a status.** It sits alongside status rather than replacing it.

Its purpose is to set a task aside without deleting it, in case of a change of mind. Storing it as
a status would overwrite the status it is meant to preserve — an In Progress task that was omitted
and later restored would come back as Not Started, which is false.

Omitted tasks are excluded from default lists and progress counts, and are never overdue.

### Deletion
Tasks are **soft-deleted**: a deletion date is recorded, the row is not removed. This makes a trash
view, restore, and orphan-free subtasks all cheap to add later.

**One place decides what "the visible tasks in this project" means**, and every screen reads
through it. Without this discipline, soft deletion turns into every query carrying four filters
and the bug being the one place that forgot one.

### Assignee
- Defaults to the Lead.
- May be set to **None**.
- Must be a current member of the project.

### Subtasks
- One level only. A subtask cannot have subtasks.
- Maximum **50 per task**. Unbounded lists break queries, payloads and rendering.
- Same fields as tasks.
- A subtask's due date must be set between today and the parent task's due date, or left empty.
- **Validated when the date is changed, not continuously** — so a subtask going overdue does not
  become unsavable.
- If the parent's due date moves earlier, subtask dates that now exceed it are **cleared**. The
  Lead sees a confirmation prompt naming how many will be affected before this happens.
- **"TBD" is a word on screen for an empty date field.** It is not a stored value.

### Views
**List first, board later.** The statuses are board-shaped, and a board is expected eventually.

### Ordering
**Position is stored, not derived from a sort.** Each task carries an integer `position`.

Chosen because the two directions are not symmetrical: a sort by due date or priority can be added
at any time for free, since it sorts data that already exists. Manual ordering cannot — adding it
later means inventing positions for every existing task and rebuilding the list around dragging.
One door stays open forever, the other has a deadline.

- **Integers, widely spaced** — around 65536 apart. Integers are exact, so two tasks can never end
  up almost-equal, and the midpoint is plain division.
- **Scoped, not global.** A task's position is meaningful within its project; a subtask's within its
  parent task. This is what makes the board cheap later: within a status column, show that column's
  tasks in the same position order. Dragging between columns changes status and leaves position
  alone.
- **A move writes one row.** The new position is the midpoint of its two neighbours, so nothing else
  changes. Cost is independent of list length.
- **Exhaustion is detected, not predicted.** After computing a candidate position, check that it is
  strictly between the rows above and below. If it is, write it. If not, there was no room:
  renumber that one list back to clean spacing and place the task — both in the same transaction,
  so the list is never half-renumbered.
- Test the *result*, not the gap. A threshold like "gap below 2" is a proxy for "there is no room,"
  and proxies drift out of sync with the thing they stand for when the surrounding code changes.
- **Every move goes through one operation** — "place this task between these two." Drags, inserts,
  and the board's cross-column moves all call it. Nothing else in the app touches a position value.
- Rebalancing is scoped to a single project's tasks or a single task's subtasks. Never the table.
- Dragging is disabled whenever a field sort is active, since "put this here" and "the app decides
  placement" cannot both be true.

*Rejected — consecutive integers (1, 2, 3):* one drag rewrites every row below the insertion point,
and two people dragging at once each compute a full renumbering from what they saw, so the second
save silently overwrites the first.

*Rejected — string / fractional keys, which never exhaust:* they earn their keep when clients must
generate positions with no server to ask (offline or local-first), when the same list is reordered
concurrently often enough that whole-list rebalances contend, or when lists are large enough that a
rebalance is unaffordable. None applies here. They also fail silently if the database sorts text by
locale rules rather than byte values.

---

## 8. Notifications

- In-app floating popup only. **No email.** Deferred deliberately.
- The project-deletion banner is **derived** from the project's scheduled deletion date. No stored
  notification records are needed, because the fact is already recorded.
- The durable signal that an invite was accepted is the new member appearing in the members list.
  The popup is decoration and nothing should depend on it being seen.

---

## 9. Open questions

Written down so they are deferred rather than forgotten. Refer to these by name — the numbers are
not stable, since resolved items are removed.

1. **Recurring tasks.** Never discussed. Note that the choice between "one row with a rule" and
   "many materialized rows" is very hard to reverse once there is data.
2. **Dependencies between tasks.** Never discussed. Note that *On Hold* is often "waiting for task
   X," which is a dependency in disguise.
3. **Priority.** The field exists but its values have never been defined.
4. **Can an assigned associate create subtasks?** The current rules contradict each other — they
   have "the same permissions as the Lead" on an assigned task, but are also said not to create
   subtasks.
5. **Can an assigned associate change a subtask's due date?** Same contradiction: full permission on
   the parent, status-and-notes-only on the child they are auto-assigned to.
6. **Transfer and invite look like the same shape** — addressed to a person, 3-day expiry,
   accept/decline, changes a membership on acceptance. Possibly one concept with a type, rather
   than two features built twice.
7. **What happens to projects where a departing user is only an associate?** Covered for projects
   they lead; not for ones they merely belong to.
8. **How the CSV flattens the task/subtask tree.** Tasks and subtasks are a tree; CSV is flat.
9. **Rate limiting invites.** Proposed but not confirmed: limit how many *distinct* addresses one
   person can invite in a window, to prevent using the "No email found" response to harvest which
   addresses have accounts.
10. **Project, account and task deletion are the same mechanism three times** — mark, wait, purge,
    with different durations. Undecided whether to build it once.
11. **Purging.** Soft deletion means nothing is ever truly gone. A real permanent-delete path will
    eventually be needed.

---

## 10. Principles being applied

The reusable part. These outlast this app.

- **Make bad states impossible to write**, rather than forbidden by a rule you have to remember. A
  rule you must remember is a bug waiting for the day you forget.
- **The client sends intent; the server derives facts** — especially identity and time. Never let
  the browser say who it is or what time it is.
- **Reference things by id.** Names and emails change; identities do not.
- **Anything that waits needs a record.** If you catch yourself saying "pending," it is a record.
- **Prefer computing an answer from stored facts** over running background jobs that change stored
  facts. Fewer moving parts, nothing to fall out of sync.
- **Prefer adding a fact over destroying one.** Destroyed information is the only mistake that is
  not a migration.
- **When several features need the same underlying operation, build the operation once.** Writing
  it three times means getting it wrong in the one you tested least.
- **A fact that belongs to neither side of a relationship means the relationship is itself a
  thing** — and needs its own record.
- **But do not reach for join tables everywhere.** The test is whether *both* sides can have many
  of the other. A task has exactly one project, so it just carries a reference.
- **A feature that drags a whole subsystem behind it is not a feature.** Recognizing that early is
  how scope stays honest.
- **Test the outcome, not a proxy for it.** A threshold that approximates the condition you care
  about will drift away from it as the surrounding code changes. Check the real thing.
- **Making a costly operation rare beats engineering it out of existence.** Usually cheaper, usually
  simpler, and the remaining cost stops mattering.
- **When two options are asymmetrical, take the one that keeps the door open.** One direction is
  free forever; the other has a deadline.
