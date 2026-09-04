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

- **Postgres runs locally in Docker.** Test speed compounds over months, and knowing what a database
  server actually *is* has value. *Retreat clause:* if Docker fights you for more than an hour, use
  Neon's free hosted tier and move on. That is a legitimate call, not a failure — the goal is to
  learn the backend, not to win an argument with Windows.
- **The migration runner is written by hand**, in roughly forty lines: read the files in order,
  check which have already been applied, apply the rest, record them. Building it demystifies
  migrations permanently and keeps the SQL raw. A library here would hide the concept being learned.

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

## Open

**Hours per week is unknown.** Without it there is no way to say whether a slice is one evening or
three, which makes it hard to distinguish being stuck from going at a reasonable pace. Worth stating
even roughly.

---

## Progress log

Append one line per completed step: what was built, what was learned, anything that changed a
decision in `design-decisions.md`.

*(empty)*
