# Taskco — Learning path

**Current step:** 1, not started. Nothing has been built.

Companion to [`design-decisions.md`](./design-decisions.md), which holds *what* is being built and
why. This file holds *how the building proceeds* and *what to learn at each stage*.

---

## Purpose

Build Taskco to professional standards as a way of gaining engineering experience. The app running
matters less than understanding why it is built the way it is. Real-world use is optional.

Claude's role is mentor: specify each step, explain the concepts, review the work. Not write it.

---

## How each step works

1. **Claude specifies the step** — what it must do, what "done" looks like, which concepts are
   involved, and what usually goes wrong.
2. **Stjepan builds it** on his own branch.
3. **Stjepan shows the result** — a diff, a branch, or pasted code.
4. **Claude reviews** for correctness, for structure, against the standards below, and against
   `design-decisions.md`.
5. **Anything learned gets recorded** — in that document if it changes a decision, in the progress
   log here otherwise.

### Rules

- **Nothing is built without explicit confirmation first.**
- **Concepts get explained. Syntax gets looked up.** Guessing at an unfamiliar concept is wasted
  time; looking up a method signature is not.
- **Stuck for twenty minutes is learning. Stuck for three hours is attrition.** Say so and ask for
  more — up to and including writing it together. There is nothing to prove by struggling.
- **No code gets written for Stjepan by default.** He can always ask for it.

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

### Step 4 — Slice C: invites, delete mode, routines

**Goal:** the remaining tables and the lifecycle rules.

**Done looks like:** an invite can be created, accepted, and refused when expired — with expiry
derived rather than swept. A project can enter delete mode and be undone. A routine can be defined
and completed, and a streak can be computed from the log.

**Concepts involved:**
- Modelling something that waits: state fields and legal transitions
- Derived state versus stored state
- Computing over a log rather than mutating a counter

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
| 4. Slice C | 10–15 h | Mostly repetition of A and B, plus state modelling |
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

*(empty)*
