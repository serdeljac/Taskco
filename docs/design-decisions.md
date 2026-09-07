# Taskco — Design Decisions

**Status:** design complete, stack chosen, nothing implemented. Last updated 2026-09-01.

A running record of what has been decided, what is still open, and why. Decisions are added
here as they are made, not reconstructed afterwards. When an open question gets answered, it
moves up into the decided sections.

Companion file: [`learning-path.md`](./learning-path.md) — how the build proceeds, step by step.
This file holds *what* is being built and why; that one holds *how*.

No structural questions remain open.

---

## 1. What Taskco is

A task-management web app where multiple people collaborate on shared projects.

Any user can create a project. The creator becomes its **Lead** and can invite others, who join
as **Associates** with limited control.

Alongside projects, a separate personal surface: **daily routines**, private to one user and
belonging to no project.

Built primarily as a vehicle for learning how to plan software, so the reasoning behind each
decision is a deliverable alongside the code.

### Non-goals

Decided against, not deferred. Listed here so they are not relitigated later by someone reading the
open questions as a backlog.

- **Recurring tasks inside projects.** Repetition belongs to personal routines only. Projects are
  work that completes; routines are habits that continue. Two surfaces, two rules, no overlap.
  *Accepted cost:* shared recurring obligations — a weekly status report, a monthly invoice — have
  nowhere to live. The Lead recreates them by hand, or someone tracks them as a private routine
  where the team cannot see it and nobody can be assigned.
- **Subscription tiers and billing.** Would have added a payment provider, asynchronous plan state
  the app does not control, a second authorization system (entitlements, which answer to billing
  rather than to role), and the downgrade problem.
- **Dependencies between tasks.** No stored links saying one task must finish before another can
  start. Sequencing is expressed by the *On Hold* status plus a note, which a person reads.
  *Accepted cost:* the app cannot answer "what is ready to work on," cannot unblock a task
  automatically when its predecessor completes, and cannot display the order of work anywhere.
  Deferring is cheap — it is an ordinary join table between tasks and tasks, with no accumulated
  history lost by waiting — but it would also introduce the first graph in the app, and with it
  cycle detection, since nothing structurally prevents A waiting on B waiting on C waiting on A.
- **Nesting below subtasks.** A subtask cannot have subtasks. Fixing depth at two levels keeps every
  operation a simple join rather than a recursive query, and keeps deletion, completion, filtering
  and progress from acquiring recursive semantics.

---

## 2. The shape of the data

Five kinds of record:

| Record | Belongs to | Notes |
|---|---|---|
| **User** | — | A person with an account. Holds their timezone. |
| **Project** | — | Created by a user, who becomes Lead. |
| **Membership** | user + project | One per person-per-project. Holds the role. Soft-deleted when it ends, so former members stay recoverable. |
| **Task** | one project | |
| **Subtask** | one task | One level deep only. Max 50 per task. |
| **Routine** | one user | Outside the project model entirely. See section 8. |
| **Completion** | one routine | One row per day the routine was done. |

**Membership is a join table.** Users and projects are both top-level; neither is nested inside
the other. The role lives on the membership because it belongs to neither side — you can be a
Lead on one project and an Associate on another.

Users are referenced by an internal id that never changes. Never by email or name.

**Ids are `bigint` identity columns**, decided 2026-09-05 while writing the first migration. Every
table and every foreign key inherits this, which is why it was settled before the first one was
written rather than after. Sequential integers are compact, cheap to index, and readable in query
output while the database is still being learned — which is worth real money right now.
*Accepted cost:* ids are guessable and leak magnitude. `/projects/47` implies forty-six others
exist. That matters for a public product; this is explicitly not one, and the design doc's actual
requirement — an internal id that never changes and is never an email or a name — is met either way.
*If it ever needs revisiting*, the alternative is `uuidv7()`, which Postgres 18 provides natively.

**Ids arrive in JavaScript as strings, not numbers.** Learned 2026-09-06, building slice A. A
`bigint` can exceed what JavaScript represents exactly, so the driver returns it as a string rather
than silently losing precision. This is correct and it propagates upward: the HTTP layer will
serialise ids as strings and the frontend will receive strings. Anywhere someone writes `id === 1`
instead of `id === "1"`, the comparison silently never matches. Nothing about this is a workaround —
an id is a label to compare, never a number to do arithmetic on, which is the same reason the design
says to reference things by id in the first place.

**Column-level decisions**, settled 2026-09-05 as the first real tables were written:

- **Email uniqueness is enforced on `lower(email)`**, by a unique index rather than by application
  code. Two addresses differing only in capitalisation cannot both exist, whatever any query
  forgets to normalise. The address is stored as the user typed it.
- **Role is a `text` column with a `CHECK` constraint**, not a Postgres enum type. Equally strict,
  readable in raw query output, and changing the set of roles later is an ordinary migration rather
  than a multi-step alteration of a type other tables may depend on.

---

## 3. Users, projects, membership

- Any user can create a project. The creator is the Lead.
- The Lead **is a member**, with role = lead. Not a separate list.
- **One *active* membership per person per project**, enforced by a partial unique index — unique on
  (user, project) *where the membership has not ended*. Revised 2026-09-05, while writing the schema.
  The original rule was simply "one per person per project," which cannot coexist with the two rules
  either side of it: memberships are soft-deleted, and a Lead can re-invite someone who left. A
  person who leaves and returns legitimately has two rows, one of them ended. Exempting ended rows
  preserves the membership history the re-invite convenience depends on, while still making a
  duplicate *active* membership impossible to write.
- No subscription tiers. Considered and deliberately dropped — billing would have added a payment
  provider, asynchronous plan state, a second authorization system, and the downgrade problem,
  none of which serve the goal of this project.
- "Solo" is not a project type. It is a project that currently has one member. The rule underneath
  is the same in both cases: an assignee must be a member of the project.

---

## 4. Permissions

Permission depends on two things: the person's **role** in the project, and the **project's
lifecycle state**. It does not depend on who a task is assigned to.

| Who | Can do |
|---|---|
| Lead | Everything in the project |
| Associate | Change status and edit notes, on any task or subtask in the project |
| Any member, while the project is pending deletion | Nothing — no read, no write |

**This is role-level, not row-level.** "Can this user change a status?" is answerable from their
membership alone, without loading the task. Assignment was originally going to gate permissions,
which would have made every check depend on the specific row being acted on; removing that was the
largest single simplification in the design.

Associates therefore cannot: create or delete tasks or subtasks, change due dates, change priority,
change assignment, invite anyone, or alter the project.

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

### One Lead
A project has exactly one Lead at all times. There is no co-lead and no vacant state.

### Transfer of leadership
- **Only an existing member can be made Lead**, and the change is **immediate** — no acceptance step
  and no link.
- The new Lead is notified. This is a notification, not a request; they may not be logged in when it
  fires, so nothing may depend on it being seen. The durable signal is their role in the members
  list.
- Promotion without consent is acceptable here *because an exit exists*: the new Lead can pass
  leadership to another member, or delete the project if they are alone in it. An obligation you can
  put down is not a trap. It is also why transfer is restricted to members — they already opted into
  the project.
- The outgoing Lead chooses to **stay as an associate** or **leave the project**.
- Other members' roles are unaffected.

### Removing a member
One shared operation, called by every path that removes someone — a Lead removing an associate, a
member leaving voluntarily, an outgoing Lead choosing to leave, or account deletion.

- The membership is **soft-deleted**: the row is kept and the date it ended is recorded.
- Any task or subtask they were assigned to has its assignee set to **None**.
- This maintains the invariant: *an assignee must be a current member of the project.*

### Membership history
Because memberships are soft-deleted rather than removed, "everyone who has ever been in this
project" is just the memberships including ended ones. The Lead can see former members and re-invite
one in a single click, without having to remember who they were.

This is why the record lives on the membership rather than on invites: invites are destroyed on
acceptance, so they cannot answer the question.

**A purged user drops out of the history entirely**, and the Lead loses the convenience for that one
person. "Delete my account" and "re-invite whoever left" want opposite things, and the deletion
request wins.

### Delete mode
One mechanism, shared by every deletion. Entered by deleting a project directly, or by deleting an
account that leads it.

- Requires confirmation first.
- **30 days**, then the project and all its data are removed.
- The confirmation also offers **delete permanently now**. This is a per-deletion choice, never a
  setting — a standing preference would silently remove the safety net from future deletions made in
  a different frame of mind.
- **Can be undone** at any point in the window, but only while the Lead's account is active.
- Members cannot see the project. They get a notification of its status, telling them to contact the
  Lead.
- The Lead cannot change tasks or roles, and cannot send invites.
- Pending invites are rejected on acceptance even if their link is still valid — checked against the
  project's state at acceptance time, so nothing needs sweeping.
- The Lead can still export.

### Deleting an account
- The user is first shown **a list of every project they lead**, each with a dropdown of that
  project's members, a change button, and a confirmation.
- For each project they may **transfer it to a member** or **delete it**. Some projects should die
  with their owner.
- If a project has no other members the dropdown is disabled and reads "No members," so that project
  can only be deleted.
- Projects not transferred enter **delete mode**.
- **Memberships in other people's projects are removed immediately**, via the shared remove-member
  operation.
- The account is deactivated, not erased. Reopening within 30 days cancels delete mode on the
  projects they still lead.
- Personal **routines are purged with the account**. They belong to no other person and no project.

*Accepted asymmetry:* reopening restores the projects they led, but **not** their memberships in
other people's projects — those were removed at request time and need re-invitation. The membership
history is what makes that one click rather than an act of memory.

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

### Priority
Three values — **Low**, **Med**, **High** — and **no default**. A task has no priority until someone
sets one.

Three levels rather than five: with five, people cluster on the middle and leave the extremes
unused, which is three levels with extra steps.

No default because a default is what most items end up as, so whatever it is becomes the meaning of
"nobody has looked at this yet." Defaulting to Low would mark untriaged work as judged unimportant
and sink it to the bottom of any priority sort, which is where things get forgotten. Leaving it
unset keeps *evaluated* distinguishable from *not evaluated* — the same distinction that made Omit
a flag rather than a status, and TBD different from a date nobody set.

An empty priority reads as a question. "Low" reads as an answer.

Only the Lead can set priority.

*Dropped — Omit:* originally a fifth status, then a flag, now removed. It existed to set a task
aside without losing it, and soft deletion already provides that recovery path. The only thing lost
is the distinction between "set aside but visible" and "in the trash," which is presentation rather
than modelling. It can return later as a flag with no rework.

### Deletion
Tasks are **soft-deleted**: a deletion date is recorded, the row is not removed. This makes a trash
view, restore, and orphan-free subtasks all cheap to add later.

**One place decides what "the visible tasks in this project" means**, and every screen reads
through it. Without this discipline, soft deletion turns into every query carrying four filters
and the bug being the one place that forgot one.

### Assignee
**Assignment is organizational only.** It records who is expected to do the work and has no effect
on permissions.

- A task defaults to the Lead. The Lead may set it to **None**, meaning nobody specific.
- A subtask inherits the task's assignee at the moment it is created — including None.
- That inheritance is a **default at creation, not a live link.** Reassigning a task later does not
  move its existing subtasks.
- Only the Lead can change an assignment, since associates are limited to status and notes.
- An assignee must be a current member of the project.

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

## 8. Dates and time

Applies app-wide, not just to tasks.

**A due date is a calendar label, not a moment.** "Due Friday" means the square on the calendar, and
it has no timezone. It is stored as a plain date and never converted — converting it would turn a
task due Friday in Zagreb into one due Thursday afternoon in Los Angeles, which is not what anyone
meant.

**A timestamp is a moment.** Created-at, completed-at, invite expiry, scheduled deletion. Stored in
UTC, rendered in the timezone of whoever is looking.

**Timezone lives on the user**, defaulted from the browser at signup and changeable in settings. It
is never copied onto a task or any other record. Copying a mutable attribute of one entity onto a
different entity — and freezing it there — is the same mistake as keying memberships on an email
address: it goes stale the moment the original changes, and here it would go stale every time
someone travelled or a task was reassigned.

**"Today" always means today for the person asking**, resolved through their timezone. This is the
one rule behind three separate questions:

- The subtask rule that a due date must fall between today and the parent's due date.
- Whether a task due the 14th is overdue yet.
- Whether a routine counts as done today, and whether a streak survives.

Streaks are the sensitive one — a streak that resets at the server's midnight instead of the user's
breaks at 7pm, and users read that as the app being broken.

---

## 9. Daily routines

A separate surface from projects. Private to one user, never shared, never assignable, not part of
any project.

**Why separate.** A project task is work that *completes* and then leaves the list. A routine never
completes — the point is continuing it. They are different objects with different definitions of
success, and forcing them into one model is what makes recurrence awkward in most task apps.

**Shape: a definition plus a log.**

- **Routine** — belongs to a user. A name and a recurrence rule, e.g. "every weekday."
- **Completion** — one row per routine per day it was actually done.

No status field, no assignee, no due date, no subtasks.

Whether today's routine is done is **derived**: is there a completion row dated today? Streaks and
history fall out of the log without being designed for.

**Occurrences are never generated.** The future is computed from the rule; the past is read from the
log. Completing a routine *adds a fact* rather than mutating one, so nothing has to be reset at
midnight.

*Rejected — routines as tasks with no project:* would make a task's project reference optional, and
optional ownership leaks into every list query and permission check as a second case that code can
silently forget to handle.

**Build order:** after the collaborative core works. Routines share nothing with the project model,
so they can neither teach nor block the hard part.

*Accepted consequence:* this does not remove recurrence from projects permanently. "Weekly status
report" is real recurring project work. If it comes up, the materialize-versus-rule question
returns — and deferring it is only cheap until recurring project data exists.

## 10. Notifications

- In-app floating popup only. **No email.** Deferred deliberately.
- The project-deletion banner is **derived** from the project's scheduled deletion date. No stored
  notification records are needed, because the fact is already recorded.
- The durable signal that an invite was accepted is the new member appearing in the members list.
  The popup is decoration and nothing should depend on it being seen.

---

## 11. Stack

Chosen 2026-09-01. Nothing built yet.

**Most of this is unfamiliar.** React, TypeScript, SQL and SASS are learning targets, not existing
skills; comfort is in JavaScript, HTML and CSS. Everything under Backend and Testing is new. Build
guidance should assume the *concepts* are new and explain them; syntax can be looked up.

**How the build proceeds:** one step at a time. Each step is specified — what it must do, what
"done" looks like, what to watch for — then written by Stjepan on his own branch, then reviewed.
Nothing is built without explicit confirmation first.

### Frontend
| Piece | Role |
|---|---|
| React | UI |
| Vite | Build tool and dev server — not a framework |
| TypeScript | |
| SASS | Styling |
| React Router | Routing. Vite ships none |
| `fetch` | Data fetching to start. TanStack Query only if hand-managing loading states becomes painful |
| dnd-kit | Drag ordering. Not needed until there is a list to drag |

### Backend
| Piece | Role |
|---|---|
| Node.js | Runtime |
| Express | HTTP framework |
| TypeScript | Same language both sides, so task/membership/role types are written once |
| `pg` | Postgres driver. Raw SQL, no ORM |
| Zod | Request validation — where "the client sends intent, the server derives facts" becomes code |
| `tsx` | Runs `.ts` files on Node. Type *checking* is a separate command, `tsc --noEmit` |

### Database
**PostgreSQL.** Its constraints are what make the "bad states unrepresentable" decisions real: the
one-membership-per-person rule, the assignee-must-be-a-member invariant, and one-pending-invite-per
-address are all enforced by the database rather than trusted to application code.

Schema is hand-written SQL migration files.

### Testing
**Vitest** and **Supertest**. Not optional: the backend is being built before any interface, so
tests are the only thing that will exercise the model. Without them the code would be written and
never called.

### Rejected
*Next.js* — bundles frontend and backend together. Vite keeps them as separate programs, which suits
building the backend first.

*An ORM (Prisma, Drizzle)* — the reasonable professional default and the wrong choice here. Its
purpose is to hide SQL, and SQL is a stated learning goal. Writing the schema by hand is what turns
the design decisions into something concrete. *Escape hatch if the boilerplate grates:* Kysely, a
typed query builder that still reads like SQL.

*SQLite* — simpler and zero-setup, but avoids concurrency and constraint work that is the point.

### Still open
Authentication (session cookies versus tokens, and a password hashing library) and hosting.

*Resolved 2026-09-04:* the migration runner is written by hand rather than taken from a library, and
Postgres runs natively on Windows rather than in Docker. Both are recorded with their reasoning in
[`learning-path.md`](./learning-path.md), step 1.

---

## 12. Open questions

Nothing structural is outstanding. Every remaining item is decided in principle and marked
*(at build time)* — only the detail is open, and it is cheaper to settle against real code than in
the abstract. Refer to these by name; the numbers are not stable, since resolved items are removed.

1. **How the CSV flattens the task/subtask tree.** Tasks and subtasks are a tree; CSV is flat.
   *(at build time)*
2. **Rate limiting invites.** Limit how many *distinct* addresses one person can invite in a window,
   to stop the "No email found" response being used to harvest which addresses have accounts.
   *(at build time)*
3. **Purging.** Soft deletion means nothing is ever truly gone. Delete mode covers projects and
   accounts; tasks and ended memberships still accumulate. *(at build time)*
4. **Email notifications.** In-app popups only for now; email is a deliberate deferral, not a
   non-goal. *(at build time)*

---

## 13. Principles being applied

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
- **A calendar label is not a moment.** Dates and timestamps look alike and behave completely
  differently; converting one as though it were the other is how "due Friday" becomes Thursday.
- **Don't freeze one entity's mutable attribute onto another entity.** It goes stale as soon as the
  original changes, and nothing tells you it has.
- **A per-action choice is not a standing preference.** A setting is a decision about every future
  case, made while thinking about only one of them.
- **An obligation is only safe to hand over unasked if the recipient can put it down.** Consent
  matters in proportion to how stuck someone gets without it.
