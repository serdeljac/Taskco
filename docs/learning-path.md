# Taskco — Learning path

**Current step:** 4b complete on 2026-10-08 on branch `step-4b` — transfer of leadership and
account deletion, one migration, one hundred and twenty-eight tests in seven files — not yet
merged. Next is its checkpoint review, on the branch, then merging. After that, step 4c — routines.

Companion to [`design-decisions.md`](./design-decisions.md), which holds *what* is being built and
why. This file holds *how the building proceeds* and *what to learn at each stage*.

Checkpoint reviews live in their own files: [`slice-a-review.md`](./slice-a-review.md),
[`slice-b-review.md`](./slice-b-review.md), [`slice-c-review.md`](./slice-c-review.md).
[`reference.md`](./reference.md) is the lookup sheet — files, schema, commands, error codes.
[`open-items.md`](./open-items.md) is the one place that says whether something is still open.

---

## Purpose

Build Taskco to professional standards as a way of gaining engineering experience. The app running
matters less than understanding why it is built the way it is. Real-world use is optional.

Claude's role is mentor: specify each step, explain the concepts, give the code, review the work.
Stjepan types the code in himself — Claude does not edit the source files.

---

## How each step works

1. **Claude specifies the step** — what it must do, what "done" looks like, which concepts are
   involved, and what usually goes wrong.
2. **Claude gives the code** — in small pieces, each with the file and line it goes at and the
   reason it is written that way. Tests come first, with what the failure should look like.
3. **Stjepan implements it** on his own branch, typing each piece in by hand rather than having it
   applied for him.
4. **Stjepan shows the result** — a diff, a branch, or pasted code.
5. **Claude reviews** for correctness, for structure, against the standards below, and against
   `design-decisions.md`.
6. **Anything learned gets recorded** — in that document if it changes a decision, in the progress
   log here otherwise.

### Rules

- **Nothing is built without explicit confirmation first.**
- **Concepts get explained. Syntax gets looked up.** Guessing at an unfamiliar concept is wasted
  time; looking up a method signature is not.
- **Stuck for twenty minutes is learning. Stuck for three hours is attrition.** Say so and ask for
  more — up to and including writing it together. There is nothing to prove by struggling.
- **Claude gives the code; Stjepan types it in.** Implementing it by hand is the learning, so Claude
  hands over code with its file, line and reasoning, and never edits the source files itself. A
  description with no code is not a specification. *Corrected 2026-09-30:* this rule used to read
  "no code gets written for Stjepan by default," which was never how the work was done, and it
  produced a spec with no code in it the first time a fresh session took it at its word.

### Starting a fresh session

Read `design-decisions.md` first, then this file. Check "Current step" above, then **ask what has
actually been built** before specifying anything. This file records the plan, not the state of the
working tree, and the two drift apart the moment anything happens out of order.

---

## Prior knowledge

**Comfortable:** JavaScript, HTML, CSS.

**New:** React, TypeScript, SQL, SASS, Node, Express, PostgreSQL, testing, and everything about how
a server is structured.

Assume competence at writing code. Assume no experience at deciding what code to write.

---

## What "professional" means here

The stated goal is to build this professionally. That has to be a standard something can fail
against, or it collapses into "it works" — which is the bar already cleared.

- **No secrets in git.** Connection strings and keys live in `.env`, which is git-ignored. If one is
  ever committed, it is compromised and must be rotated, not just deleted.
- **Migrations are forward-only.** Once a migration file has been applied, it is never edited. A
  mistake is corrected by a new migration, because editing an applied one means every environment
  now has a different schema than the file claims.
- **Constraints live in the database** wherever the database can express them. Application code that
  "remembers" a rule is a rule that will eventually be forgotten.
- **Tests assert failures, not just successes.** A test that only proves the happy path proves very
  little. The valuable test is the one where a constraint *rejects* something.
- **Commits are small enough to review** and their messages say why, not what. The diff already says
  what.
- **No commented-out code.** Git remembers it. Commented code is a note to nobody.
- **Nothing is copied in without understanding it.** If a snippet works and it is not clear why,
  that is a question, not a solution.

---

## Build order

Riskiest and most load-bearing first, sliced so that each step ends in something provable rather
than something merely written.

**On visible output:** there is no screen until step 7. Step 2 is the earliest point at which
anything is provably real, and it will be a passing test rather than something to look at. An
optional throwaway HTML page is noted at step 3 for morale — it is a debugging tool, not the
frontend.

---

### Step 1 — Environment

**Goal:** a Node project in TypeScript, a running PostgreSQL database, and a migration runner
written by hand.

**Why first:** everything is blocked on it, and it is the least interesting step in the project.
That combination is normal and worth naming, because the temptation is to rush it and pay later.

**Decisions already made:**

- **Postgres runs locally, installed natively on Windows.** Revised 2026-09-04. This step originally
  said Docker. The machine is Windows 11 Home, which has no Hyper-V, so Docker Desktop requires the
  WSL2 backend — meaning WSL, a reboot, and Docker Desktop all installed before the first line of
  code, with virtualization-disabled-in-BIOS as a failure mode that cannot be debugged from inside
  the OS. What Docker actually buys is a disposable environment and parity with production, and both
  of those pay off at deployment, which is past step 7. Steps 2–4 are SQL, constraints and
  transactions, and those are identical whatever the database runs inside.
  *Accepted cost:* the database is a permanent Windows service rather than a box that can be thrown
  away, so "start clean" means dropping and recreating databases by hand. The container model is
  deferred rather than dropped; it gets a step of its own when there is something to deploy.
  *Retreat clause:* if the installer fights, Neon's free hosted tier works — accepting that every
  query becomes a network round trip, which is felt in the test suite from step 2 onward.
- **Two databases from the start — `taskco_dev` and `taskco_test`** — with the connection string in
  `.env` deciding which one is in use. Added 2026-09-04. The reason belongs to step 2: tests that
  prove a constraint *rejects* something must create rows, break them and clean up, and doing that
  against the database being clicked around in by hand produces two failures. The obvious one is
  losing work. The dangerous one is a suite that passes because of a row left behind days earlier.
  Costs a minute now; retrofitting means untangling every test that assumed a shared database.
- **The application connects as its own role**, not as the `postgres` superuser, scoped to those two
  databases. The distinction is free on a laptop with one app and stops being free the moment there
  is a server — by which point the connection string is in several places.
- **The migration runner is written by hand**, in roughly forty lines: read the files in order,
  check which have already been applied, apply the rest, record them. Building it demystifies
  migrations permanently and keeps the SQL raw. A library here would hide the concept being learned.
- **TypeScript runs through `tsx`, with `tsc --noEmit` as a separate check.** Node cannot execute
  `.ts` directly; something must strip the types first. Node 22 can do this natively behind a flag,
  but it rejects some TypeScript features and reports the refusal in terms aimed at people who
  already know the language. Two tools with one job each keeps "does this run" and "are my types
  right" as independent questions — and it is worth knowing early that the runner executes even when
  the types are wrong.

**Done looks like:** a TypeScript file that connects to the database, runs a trivial query, prints
the result, and exits cleanly. One migration has been applied, and running the runner a second time
does nothing.

**Also in this step:** `.env` with the connection string, `.env` in `.gitignore`, and a
`.gitattributes` file to settle line endings — git has been warning about CRLF conversion on every
commit, which is harmless now and stops being harmless once there are shell scripts.

**Concepts involved:**
- What a runtime is, and how Node differs from the browser
- How TypeScript compiles, and what `tsconfig` actually controls
- Connection strings, and why credentials never live in source control
- What a migration is, and why schema changes are files rather than clicks

**Known traps:** running TypeScript directly on Node is fiddlier than it should be — expect to spend
time on module settings, and ask rather than grinding. Also: a migration runner that reapplies files
it has already run, and assuming the database is reachable without checking.

---

### Step 2 — Slice A: identity and membership

**Goal:** users, projects and memberships — schema *and* queries *and* tests, together.

**Why sliced this way:** writing eight tables before running a single query is the longest possible
feedback loop applied to the subject most worth learning. A foreign key is understood far better
after a join fails than by reading about one. Each slice is schema, then queries against it, then
proof.

This slice first because it is the join table — the piece of the design that took the longest to
arrive at, and the one everything else hangs from.

**Done looks like:** a user can be created, a project can be created, a member can be added, and
"what projects am I in" returns the right answer. Plus a test proving the database *refuses* to add
the same person to a project twice.

**Concepts involved:**
- Primary keys, and why they are not the same as anything a user sees
- Foreign keys, and what happens to children when a parent is deleted
- Unique constraints — one membership per person per project
- Indexes, and why "what projects am I in" needs one
- Joins
- Parameterized queries, and why string concatenation into SQL is the classic vulnerability
- What a test asserts, and why the failure case matters more than the success case

**Every query takes a user id as a parameter, starting now.** Where that id comes from is a separate
question — hardcode it for the moment. This is deliberate: it builds the habit of asking "whose
data?" from the first line, without needing authentication to exist yet. See step 6.

---

### Checkpoint — review the design against reality

After slice A, re-read `design-decisions.md` and record what turned out to be wrong.

It will contain mistakes. That is not a failure of the design process — it is the reason for
building at all. Decisions that survived contact are now trustworthy; ones that did not get
corrected in the document with a note on why.

---

### Step 3 — Slice B: tasks and subtasks

**Goal:** tasks and subtasks, with positions, the due-date rule, and the parent-date cascade.

**Done looks like:** tasks can be created, ordered, and reordered by writing a single row. A subtask
cannot be given a due date beyond its parent's. Moving a parent's date earlier clears the offending
subtask dates — in one transaction, all or nothing.

**Concepts involved:**
- Transactions, and why the cascade must be one
- Nullable columns, and the difference between "no priority" and "priority is Low"
- Dates versus timestamps, and why due dates carry no timezone
- Integer positions with gaps, midpoint insertion, and rebalancing on exhaustion
- Soft deletion, and the single place that defines "visible tasks"

**Optional, for morale:** a throwaway HTML page that lists projects and tasks. An hour's work, no
framework, deleted later. It is a debugging tool, and there is nothing unprofessional about wanting
to see something.

---

### Step 4 — Slice C: the assignee, invites, delete mode

**Goal:** the assignee column the design now knows how to enforce, and the two lifecycle rules that
model something waiting.

**Rescoped 2026-09-27.** This step used to carry routines as well, and account deletion sat
implicitly inside "delete mode." Both moved out — see the two steps below. What is left is one
lesson taught twice: an invite waits and its expiry is derived; a project in delete mode waits and
its banner is derived. The two also interlock, because a pending invite is refused against the
project's state at the moment it is accepted, so they cannot sensibly be built apart.

**Done looks like:** a task can be assigned, and the database refuses an assignee whose membership
belongs to another project. An invite can be created, accepted, and refused when expired — with
expiry derived rather than swept. A project can enter delete mode, be undone, and be deleted
permanently now.

**Concepts involved:**
- Composite foreign keys, and forcing two rows to agree about a third fact
- Modelling something that waits: state fields and legal transitions
- Derived state versus stored state
- A second condition joining the first in the one place that decides what is visible

---

### Step 4b — Transfer of leadership and account deletion

**Goal:** the largest lifecycle flow in the design, which composes what step 4 built.

**Why separate.** Account deletion needs delete mode working first, then walks the Lead through
every project they lead, offering transfer or deletion for each, and removes their memberships
elsewhere through the shared remove-member operation. Transfer has its own trap already recorded:
the one-Lead index is checked as each row is written, not at commit, so the outgoing Lead must be
demoted before the new one is promoted, inside one transaction.

**Done looks like:** leadership moves between members immediately, a project with no other members
can only be deleted, and reopening an account within 30 days cancels delete mode on the projects
it still leads.

---

### Step 4c — Routines

**Goal:** the personal surface: a definition, a log, and streaks computed from it.

**Why separate.** Routines share nothing with the project model — no membership, no positions, no
soft deletion — so they can neither teach nor block the rest. They also teach a different lesson:
computing over a log rather than mutating a counter.

**Not blocked by authentication.** An earlier note here claimed streaks had to wait for sessions,
because "today" depends on who is asking. That was wrong: the timezone lives on the user's row, and
every query in this project has taken a user id since slice A. This step can be built whenever.

**Done looks like:** a routine can be defined and completed, and a streak can be computed from the
log — resolved through the asker's timezone, so it does not break at the server's midnight.

---

### Step 5 — The HTTP layer

**Goal:** Express, request validation with Zod, and the first real endpoints.

**Done looks like:** endpoints that create and read projects and tasks, with validation on every
incoming body and permission checks present from the first line rather than added afterwards.

**The rules here are already decided** in `design-decisions.md`: the client sends intent and the
server derives facts; identity comes from the session and never from the request body; permission is
enforced on the server regardless of what the interface shows.

The stubbed user id from step 2 is still stubbed — it now comes from a placeholder in the request
pipeline rather than from a constant, which is the shape authentication will slot into.

**Concepts involved:**
- What a request and response actually are
- Middleware, and why it is a pipeline
- Validation at the boundary
- Turning a failed database constraint into a meaningful response — the alternative is forty
  try/catch blocks

---

### Step 6 — Authentication

**Goal:** register, log in, and be identified on later requests. The stub is replaced by a real
session.

**Why here rather than earlier:** the reason to do auth early is that permissions depend on identity,
and endpoints that do not know who is asking train the habit of writing "give me all the tasks"
instead of "give me this person's tasks" — which is a data leak waiting for the one query someone
forgets to convert.

But that safety comes from *the user id being a parameter everywhere*, not from the session being
real. Steps 2 through 5 already have that. So the discipline arrives on day one and the complexity
waits until it is not the fourth new thing at once.

**Still undecided:** session cookies versus tokens, and which password hashing library. This step
needs its own conversation before it is specified.

---

### Step 7 — The frontend

React, Vite, TypeScript and SASS, hand-coded as its own learning exercise once the backend is real.
Deliberately last.

---

## Pace and estimates

**Available:** 4–5 hours on weekday evenings, around 10 across the weekend, alongside full-time work
elsewhere. Roughly 30 hours a week at the top end.

| Step | Estimate | Notes |
|---|---|---|
| 1. Environment | 5–10 h | Wide range because Docker on Windows either works in twenty minutes or eats an afternoon |
| 2. Slice A | 10–15 h | SQL, joins, constraints and testing all arrive at once. The steepest step |
| Checkpoint | ~1 h | |
| 3. Slice B | 12–18 h | Conceptually the hardest data work: positions, transactions, the cascade |
| 4. Slice C | 10–15 h | The assignee, invites and delete mode. Repetition of A and B, plus state modelling |
| 4b. Transfer and account deletion | 8–12 h | Composes delete mode. The largest single flow in the design |
| 4c. Routines | 6–10 h | A definition and a log. Shares nothing with the rest |
| 5. HTTP layer | 12–20 h | All new. Middleware is a genuine concept, not a syntax detail |
| 6. Authentication | 10–15 h | |
| **Backend total** | **60–95 h** | |
| 7. Frontend | 60–100+ h | Learning React, TypeScript and SASS while building every screen |

**These estimates are a stuck-detector, not a deadline.** Their only job is to signal when something
has gone wrong. If step 1 is at hour twenty-five, the problem is not speed — it is that something
needs explaining, and that is the moment to ask rather than grind. Estimates made by someone
learning are unreliable by nature, which is exactly why the *ratio* matters more than the number.

**On pace:** thirty hours a week on top of a full-time job is a sprint, and this is a months-long
project. The plan does not require that rate. A slower pace that survives to step 7 beats a fast one
that stops at step 4.

---

## Progress log

Append one line per completed step: what was built, what was learned, anything that changed a
decision in `design-decisions.md`.

**Step 1 — Environment.** Completed 2026-09-05. PostgreSQL 18 installed natively on Windows;
`taskco_dev` and `taskco_test` owned by a `taskco_app` role holding no cluster privileges beyond
login. Node project on ESM with `strict` TypeScript, `tsx` as the runner and `tsc --noEmit` as a
separate check. A pool module that fails at startup if `DATABASE_URL` is missing, and a hand-written
migration runner that applies files in sorted order inside one transaction per migration, recording
each in a `schema_migrations` table it creates itself.

*Changed decisions:* Docker dropped for a native install — reasoning in step 1 above. Ids settled as
`bigint` identity — reasoning in `design-decisions.md`, section 2.

*Learned, in rough order of how much time it cost:* that a process inherits its environment at
launch and never sees later changes — which is why a PATH edit appears not to work until the editor
itself restarts, and the same reason `dotenv` has to be the first import. That psql's `-#` prompt
means an unfinished statement, and that `\q` discards it silently. That Postgres answers "password
authentication failed" whether the password is wrong *or the role does not exist*, deliberately, so
the error names the wrong problem. That a transaction has to run on one checked-out client, because
a pool will otherwise scatter `begin` and `commit` across different connections. That `npm` silently
ignores unrecognised top-level keys in `package.json`, so a misplaced script produces no warning at
all — just a command that isn't there.

**Step 2 — Slice A: identity and membership.** Completed 2026-09-06. Migrations 002–005: `users`
gained email and timezone with a unique index on `lower(email)`; `projects` and `memberships` were
created; blank text was forbidden in three columns. Five queries in one file — the only file in the
project that writes SQL — with `createProject` writing the project and its lead membership in one
transaction. Vitest wired to `taskco_test` behind a guard that refuses any database whose name does
not end in `_test`, with the tables truncated before every test. Eight tests, four of which assert
that the database **refuses** something.

*Changed decisions:* the membership uniqueness rule, and ids arriving as strings. Both in
`design-decisions.md`, section 2 and section 3.

*Checkpoint:* [`slice-a-review.md`](./slice-a-review.md) — twelve open items, **none of which came
from a failing test.** Every test passed before the review and after it. They came from reading each
file and asking what it actually guarantees, which turned out to be the technique the checkpoint
needed and the plan never described.

*Learned, in rough order of how much time it cost:* that ESM evaluates every import before any
module body runs, so a `config()` call cannot precede an import no matter where it sits in the file.
That `not null` accepts the empty string, so a required text column is not a filled-in one. That a
`CHECK` sees only the row being written, through immutable functions only — putting other tables and
`now()` permanently out of its reach. That "at most one" is a constraint and "at least one" cannot
be, because no constraint can require a row to exist. And that a test which has never failed has not
been shown to be watching anything — proven by deleting one `where` clause and watching exactly one
test go red.

**Before slice B — review fixes.** Completed 2026-09-13 on branch `slice-a-fixes`, five commits, each
test-first. Migration `006` limits a project to one active Lead, and `removeMember` refuses to remove
the Lead, so "exactly one Lead" is now two mechanisms. The test guard reads the database name from the
parsed address, in a function with tests of its own. `addMember` and `removeMember` take labelled ids.
`noUncheckedIndexedAccess` is on. Thirteen tests.

*Changed decisions:* how the one-Lead rule is enforced, in `design-decisions.md` section 6. Review item
3 dropped as mistaken — the correction is in `slice-a-review.md`, section 5. And the assignee rule is
reopened as an open question, because the way section 11 says it is enforced cannot work.

*Learned, in rough order of how much time it cost:* what a test actually exercises — real code against
a real database, fed made-up values, with the tables emptied *before* each test rather than after, so
the last test's rows stay behind to be looked at. That a migration runs once and leaves rules in the
database, which then act on every row written. That `.rejects` checks for a refusal and cannot cause
one, which is why a test written before its rule stays red until the rule exists. That two rules can
refuse with the same code, so naming the constraint is what shows *which* rule refused — proven by
adding the existing Lead again and watching the test still pass on the code alone. That commenting out
the `update` while adding the Lead check broke a slice A test: the older tests caught what the new one
was not looking at. That `truncate ... cascade` follows foreign keys, which made one of the review's
own items wrong — found by checking before building the fix. That a string has no parts until
`new URL()` builds an object from it. And that TypeScript cannot see the database: it knows what a
list holds but never how many, and it checks nothing typed `any`.

**Step 3 — Slice B: tasks and subtasks.** Completed 2026-09-18 on branch `slice-b`. Migrations
007–013: `tasks` and `subtasks` with status, priority, due date, notes, soft deletion read through two
views, and stored positions. Eleven functions in `queries.ts`, among them `moveTask` — midpoint
placement, exhaustion detected by testing the result, renumbering in one transaction — and
`setTaskDueDate`, which clears subtask dates past the new one in the same transaction. A seed script
and a throwaway page render `taskco_dev` in a browser. Fifty-six tests. The checkpoint is
[`slice-b-review.md`](./slice-b-review.md): fourteen items, two fixed before merging — a deleted task
could still be changed, and a task could be moved into another project's order — and neither was
found by a failing test.

*Changed decisions:* the assignee deferred out of slice B; priority stored empty and shown as "Not
set"; dates arriving as text; one view deciding what is visible; the shape of `moveTask`; the subtask
due-date rule kept in code, with its "not before today" half waiting for step 6; notes added after
the review found them in the design and missing from the schema. All in `design-decisions.md`.

*Learned, in rough order of how much time it cost:* what `.rejects` does, and why a test written
before its rule fails first — which took several explanations and a longhand rewrite as `try`/`catch`
to land. That `pg` turns a `date` into midnight on the machine's clock, so "due the 18th" left
Vancouver as `07:00Z` and would have left Zagreb on the 17th. That a view stores no rows and fixes its
column list the day it is made. That adding a required column breaks every writer at once, which is
how the first `23502` arrived. That gaps between positions make a move one row, that running out of
room is found by testing the result rather than measuring the gap, and that an `id` tiebreaker can
hide the very bug a test is looking for. That rules come as locks and signs: a `check` sees one row,
so anything that counts rows or reads a parent lives in code and only guards the writes that go
through it. And that a checkpoint review is a list of claims that can each be checked — which found
notes missing from the schema, and two real bugs that fifty passing tests had nothing to say about.

**After slice B — the fixes pass.** Completed 2026-09-27, directly on `main`. Five items closed and
one migration: a subtask under a deleted task could still take notes; `removeMember` checked the
role and ended the membership in two separate trips; the count of cleared subtask dates included
rows the Lead could not see; positions only ever climbed, until the integer ceiling refused the
write; and the cascade from projects down to subtasks had never once fired. Migration `014` forbids
a soft delete dated before its row was created. Sixty-nine tests. Slice C was rescoped the same day,
with routines moved to step 4c and transfer and account deletion to step 4b.

*Learned:* that a transaction gives atomicity, not isolation — a writer can still land between two
statements inside one, and `for update` is what stops it. That hidden is not exempt: skipping
deleted subtasks when clearing dates would let a restored one come back already breaking the rule.
That one statement is atomic for free and three are not, which is why `createTask` gained a
transaction the moment it stopped being one statement. That a cascade runs from parent to child
only, so deleting a project takes the membership and leaves the person. And that a migration's
checks cannot go red first, because the migration has to be applied before a test can watch it
refuse anything.

**Step 4 — Slice C: the assignee, invites, delete mode.** Completed 2026-09-30, directly on `main` —
the `slice-c` branch was created and never used. Migrations 015–017. A task's assignee is a
*membership*, not a user, and a composite foreign key makes an assignee from another project
unwritable; a subtask, having no `project_id`, gets a plain reference and a check in code.
`invites` holds no role and no status column, stores its expiry, and compares the address lowered —
the first customer for migration 002's index. `deletion_scheduled_at` puts a project into delete
mode, and both views now exclude it. Nine new functions and two helpers in `queries.ts`. One hundred
and ten tests. The checkpoint is [`slice-c-review.md`](./slice-c-review.md): nine items, none from a
failing test — the third review in a row where reading found more than the suite.

*Changed decisions:* how "an assignee must be a current member" is enforced, split into a lock and a
sign; an invite offers no role and has no status column; the expiry stored rather than computed;
sections 4 and 6 reconciled, so the deletion date governs the project's contents and the Lead keeps
its lifecycle; project visibility kept out of the views, because it depends on who is asking. All
in `design-decisions.md`.

*Learned, in the order the slice met them:* that a foreign key must point at a declared unique
constraint on exactly its columns, which is why `memberships (id, project_id)` needed one although
`id` alone is already unique — and that `on delete set null` needs a column list, or it empties
`project_id` too and the delete fails. That a scalar subquery finding two rows is a runtime error,
so defaulting a task to the Lead is only safe because migration `006` guarantees there is one. That
a value is only safe to derive if every input is stored, and `created_at + 3 days` hides the `3`.
That an index predicate, like a `check`, must be immutable, so "one unexpired invite per address"
cannot be an index. That "not yours" and "not found" should be the same answer. That `for share`
lets many writers hold a row that `for update` would make them queue for. And that one view
deciding visibility pays: six writers refused a project being deleted without being edited, while
`setTaskNotes`, filtering the table directly, kept writing until a test caught it.

**After slice C — the fixes pass.** Completed 2026-10-03 on branch `slice-c-fixes`. Three items
closed. `acceptInvite` refuses someone who has become a member since the invite was sent, with a
sentence instead of `23505`. A code review of every file found `setTaskDueDate` still changing
dates — and clearing subtask dates — in a project being deleted; the slice B and slice C reviews had
both listed it as protected by the view, and neither had read its `where` clause. And the thirty
days now mean something: past its date a project is gone from every answer, and
`purgeDeletedProjects`, run by hand as `npm run purge`, removes the rows. One hundred and seventeen
tests, and four new open items logged.

*Changed decisions:* scheduled deletion split into a derived answer and a purge, with a principle
added to section 13 — a job that only removes what every answer already treats as gone is cleanup,
not state. And how the work proceeds: Claude gives the code and Stjepan types it in, corrected in
the rules above after this file had said the opposite.

*Learned:* that a test which passes from the start has never been shown to watch anything, so it
gets broken on purpose — removing `ended_at is null` — and seen to go red. That the right refusal
can wear the wrong words: `23505` from an index is correct and unhelpful. That a review's claim is
only as good as the line someone actually read. That `null > now()` is unknown rather than false,
so `> now()` covers "not being deleted" for free. That deriving an answer and destroying rows are
two problems, and a late job is harmless once the answer no longer depends on it. And that the test
count is a check of its own: 113 where 112 was expected is how a duplicated test showed itself —
while a command pasted into a source file reached a commit because the suite was not run before
committing.

**Step 4b — Transfer of leadership and account deletion.** Completed 2026-10-08 on branch
`step-4b`, in two commits. `transferLeadership` hands a project to an existing member, demoting the
old Lead before promoting the new one, and lets the old Lead stay or leave. Removing a member became
`endMembership`, one helper that `removeMember`, a leaving Lead and account deletion all call.
Migration `018` gave accounts a deletion date; `deleteAccount` puts every project the user still
leads into delete mode on that date and ends their memberships elsewhere, `reopenAccount` undoes it
inside the window, `restoreProject` now refuses while the Lead's account is going, and
`purgeDeletedAccounts` joins the hand-run purge, after the projects. The tests moved from one file
into `src/test_queries`, one file per table, laid out as `//CREATE` and `//TEST`. One hundred and
twenty-eight tests; three open items closed and four logged.

*Changed decisions:* reopening an account brings back every project the user still leads inside its
window, including one deleted on its own beforehand — the literal reading of section 6, chosen
because bringing back too much costs a click and bringing back too little destroys data. Transfers
happen one at a time before an account is deleted. Memberships in other people's projects end even
when that project is in delete mode. And an account is purged only once the projects it led are
gone. All in `design-decisions.md`, section 6.

*Learned, in the order the step met them:* that a refactor is proven by the tests that already
exist — six `removeMember` tests stayed green while its body moved into `endMembership`. That the
one-Lead index is checked row by row, so swapping the demote and the promote fails with `23505`.
That `now()` is fixed for a whole transaction, which is what gives an account and its projects the
same date without passing one along. That a subquery inside an `update` can refer to the row being
updated, which is how `restoreProject` asks about the Lead without a second statement. That a
JavaScript `Date` keeps milliseconds and Postgres keeps microseconds, so comparing two moments in
JavaScript can call different dates equal — proven by moving one a microsecond and watching only the
SQL comparison notice. And that moving tests in the same commit as a feature hides the new tests
inside two thousand moved lines; a move wants its own commit, before the build.

