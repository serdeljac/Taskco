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
4. **Claude reviews** for correctness, for structure, and for whether it matches
   `design-decisions.md`.
5. **Anything learned gets recorded** — in that document if it changes a decision, here if it
   changes the plan.

### Rules

- **Nothing is built without explicit confirmation first.**
- **Concepts get explained. Syntax gets looked up.** Guessing at an unfamiliar concept is wasted
  time; looking up a method signature is not.
- **Stuck for twenty minutes is learning. Stuck for three hours is attrition.** Say so and ask for
  more — up to and including writing it together. There is nothing to prove by struggling.
- **No code gets written for Stjepan by default.** He can always ask for it.

### Starting a fresh session

Read `design-decisions.md` first, then this file. Check "Current step" above, and ask what has
actually been built before specifying anything — this file records the plan, not the state of the
working tree.

---

## Prior knowledge

**Comfortable:** JavaScript, HTML, CSS.

**New:** React, TypeScript, SQL, SASS, Node, Express, PostgreSQL, testing, and everything about how
a server is structured.

Assume competence at writing code. Assume no experience at deciding what code to write.

---

## Build order

Riskiest and most load-bearing first, so that mistakes surface while they are still cheap.

There will be no screen to look at until well after step 5. Step 3 is the earliest point at which
anything is provably real, and it will be a passing test rather than something visible. This is
expected — absence of visible progress is not absence of progress.

---

### Step 1 — Environment

**Goal:** a Node project in TypeScript, a running PostgreSQL database, and a way to apply SQL
migration files in order.

**Why first:** everything is blocked on it, and it is the least interesting step in the project.
That combination is normal and worth naming, because the temptation is to rush it and pay later.

**Done looks like:** a TypeScript file that connects to the database, runs a trivial query, prints
the result, and exits cleanly. One migration file has been applied and the tool knows it has been
applied, so running it again does nothing.

**Concepts involved:**
- What a runtime is, and how Node differs from the browser
- How TypeScript compiles, and what `tsconfig` actually controls
- Connection strings, and why credentials never live in source control
- What a migration is, and why schema changes are files rather than clicks

**Where it usually goes wrong:** committing database credentials; a migration runner that reapplies
files it has already run; assuming the database is reachable before checking.

---

### Step 2 — The schema

**Goal:** the entire data model from `design-decisions.md` as hand-written SQL migrations.

**Why here:** this is where the design stops being prose. Every decision in that document becomes a
column, a constraint, or an index — and the ones that cannot be expressed are the ones that were
never fully decided.

**Done looks like:** tables for users, projects, memberships, tasks, subtasks, invites, routines and
completions, with the constraints that make the design's invariants unbreakable rather than merely
discouraged.

**Concepts involved:**
- Primary keys, and why they are not the same as anything a user can see
- Foreign keys, and what happens to children when a parent is deleted
- Unique constraints — one membership per person per project, one pending invite per address
- Check constraints, and what belongs in the database versus the application
- Indexes, and why "what projects am I in" needs one
- Nullable columns, and the difference between "no priority" and "priority is Low"
- Dates versus timestamps, and why due dates carry no timezone

**Where it usually goes wrong:** enforcing rules in application code that the database could enforce
absolutely; forgetting the soft-delete columns and having to add them everywhere later; letting the
position column be a plain sequence.

**Most of the SQL learning lives in this step.** It is worth going slowly.

---

### Step 3 — Data access, no HTTP

**Goal:** create a user, create a project, add a membership, create a task and a subtask — all
driven by tests. No web server yet.

**Why here:** it is the first proof that the model works, and it is deliberately isolated from HTTP
so that a failure means the model is wrong rather than the request handling.

**Done looks like:** passing tests that exercise a real path through the schema, including at least
one that proves a constraint *rejects* what it should — an attempt to add the same person to a
project twice, for example.

**Concepts involved:**
- Parameterized queries, and why string concatenation into SQL is the classic vulnerability
- Transactions, and why the subtask date cascade must be one
- What a test actually asserts, and why testing the failure case matters more than the success case

---

### Step 4 — Authentication

**Goal:** a person can register, log in, and be identified on subsequent requests.

**Why *before* the endpoints, not after:** every permission in this app depends on knowing who is
asking. Building endpoints that do not know that trains you to write queries meaning "give me all
the tasks" instead of "give me this person's tasks" — and the one you later forget to convert is a
data leak. Retrofitting identity is how that happens in real products.

**Still undecided:** session cookies versus tokens, and which password hashing library. This step
needs its own conversation before it is specified.

---

### Step 5 — The HTTP layer

**Goal:** Express, request validation with Zod, and the first real endpoints — with permission
checks present from the first line rather than added afterwards.

**Sketched, not specified.** Details firm up once step 4 lands.

**The rules that apply here** are already decided in `design-decisions.md`: the client sends intent
and the server derives facts, identity comes from the session and never from the request body, and
permission is enforced on the server regardless of what the interface shows.

---

### Step 6 — Features, one at a time

Invites, delete mode, ordering, export, routines. Each one against the document.

**Sketched, not specified.**

---

### Later — The frontend

React, Vite, TypeScript and SASS, hand-coded as its own learning exercise once the backend is real.
Deliberately last.

---

## Progress log

Append one line per completed step: what was built, what was learned, anything that changed a
decision in `design-decisions.md`.

*(empty)*
