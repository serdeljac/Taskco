# Step 5 — preparation

Written 2026-10-09, after step 4c merged into `main` and before step 5 is specified. Companion to
[`design-decisions.md`](./design-decisions.md) and [`learning-path.md`](./learning-path.md), step 5.

**This file is a dated snapshot, like the reviews.** It holds what step 5 starts from, seven
questions to answer before its first line, the order the pieces would go in, and the traps waiting
in them. When a question is answered, the decision moves into `design-decisions.md`, and this file
is not edited to match. Whether something is still open is answered in
[`open-items.md`](./open-items.md).

**Every library behaviour claimed here was run**, in a throwaway copy with Express 5.2.1, Zod 4.6.5,
Supertest 7.2.2 and TypeScript 7.0.2; every database behaviour against `taskco_test`, as a plain
`select` or inside a transaction that was rolled back. The claims that were reasoned rather than run
are marked.

---

## What step 5 starts from

- **34 exported functions in `queries.ts`, and none of them checks a role.** The list reads filter
  to the asker's memberships, and the invite and routine functions take the asker's id, but nothing
  asks whether the asker is the Lead. `createTask({ projectId, title })` does not know who is
  calling. So the permission check is not a wrapper around something that exists: it is the first
  code in the project that asks "is this person the Lead here?"
- **43 `throw new Error(...)`, each with a sentence.** Six say "the insert returned no row", a state
  that cannot happen. The other 37 are refusals, and only the wording tells "not found" from "no".
- **Ids arrive as strings, dates as `"2026-10-09"`, timestamps as `Date`** (design sections 2 and
  8). JSON turns a `Date` into an ISO string, so the first two cross the wire unchanged and the third
  changes type on the way.
- **Express, Zod and Supertest are chosen** (design section 11). None is installed.

---

## The seven questions

Named like open items, so they can be referred to by name. Each has a recommendation. None is
decided.

### 1. `step-5-scope` — four endpoints, then a step 5b

| Endpoint | Who may | Calls |
|---|---|---|
| `GET /projects` | anyone | `listProjectsForUser` |
| `POST /projects` | anyone, who becomes its Lead | `createProject` |
| `GET /projects/:projectId/tasks` | a member who can see the project | `listTasks` |
| `POST /projects/:projectId/tasks` | the Lead | `createTask` |

Four is enough to prove every part of the pipeline once: a read and a write, a body to validate, an
id in the path, and all three answers to "may they?" — yes; 403, an Associate creating a task; 404,
an outsider. That is what the learning path's "Done looks like" asks for, and no more.

The other thirty functions become endpoints in a **step 5b**, one router at a time, each repeating a
pattern rather than introducing one — the same split that made steps 4, 4b and 4c. The open items
filed under step 5 that these four do not touch would move with them: `no-status-or-priority-functions`,
`account-deletion-list-not-built`, `streaks-are-one-query-per-routine` and `purge-runs-only-by-hand`.
`transfer-notifies-nobody` and `delete-mode-notifies-nobody` are different: they need a notification
mechanism the design has not described, so they wait for that conversation rather than for an
endpoint.

**Recommended:** yes.

### 2. `stub-identity` — where the placeholder's user id comes from

The learning path says the stubbed id "now comes from a placeholder in the request pipeline rather
than from a constant." There are two ways to fill the placeholder.

- **A constant inside it.** Every request is then the same person, so no test can be an Associate
  or an outsider, and "permission checks present from the first line" can never be shown to work.
- **A request header, `X-User-Id`, read by the placeholder and nowhere else.** It puts the id on
  `res.locals.userId`, and refuses with 401 when the header is missing, malformed, or names no user.
  Every handler reads `res.locals`. Step 6 replaces the inside of this one file with a session
  lookup, and no route changes.

**Recommended: the header.** It breaks section 13's rule — identity from the session, never from
the request — on purpose, in one file, for one step. It is the only version whose permission checks
can be tested.
*Accepted cost:* until step 6, anyone who can reach the server can claim to be anyone. So it
listens on `127.0.0.1` only, which no other machine can reach, and nothing is deployed before step 6.

### 3. `error-kinds` — how a refusal becomes a status code

- *Rejected — matching the sentences in the error handler.* Rewording a message would silently turn
  a 404 into a 500, and the messages were written for people.
- *Rejected — a `try`/`catch` in every route.* The forty blocks the learning path warns about.
- **Give the errors kinds.** A small `src/errors.ts` with two classes, `NotFound` and `Refused`,
  both extending `Error`, so every message stays exactly as it is — and so does every test that
  matches `{ message }`. `queries.ts` learns nothing about HTTP. The error handler, and only it,
  turns a kind into a status.

**Recommended: the kinds**, in one refactor commit before any route exists, proven by the 150 tests
staying green. That is step 4b's lesson twice over: a refactor is proven by the tests already
there, and it wants a commit of its own.

The rule for which is which: **`NotFound` when the thing named does not exist for the asker;
`Refused` when it does and a rule says no.** One group needs thought. Six messages say "not found,
or in the wrong state" — in `deleteAccount`, `reopenAccount`, `addMember`, `deleteProject`,
`restoreProject` and `deleteProjectNow` — because one statement cannot tell the two apart. By the
time a request reaches any of them, the pipeline has already answered for a project or an account
that does not exist: the permission check for one, the placeholder for the other. The only case left
is the wrong state, so all six become `Refused`. The order of the pipeline decides what the message
means.

The error handler's map, proposed:

| Error | Status |
|---|---|
| Zod's, or `express.json()`'s for a body that is not JSON | 400 |
| `NotFound` | 404 |
| `Refused` | 409 |
| `pg` `23505`, a duplicate — the one refusal only the database can make, because two requests can race past any check in code | 409 |
| `pg` `23514`, a check — Zod missed a rule, and the lock caught what the sign did not | 400 |
| Anything else, including every other `pg` code | 500, with a body that says nothing about why, and the error logged |

409 for every refusal keeps the client to one case. 422 is the other common choice, for refusals
about the input rather than the state of things; here the line is blurred — "due after its task" is
both.

### 4. `permission-check` — where "may they?" is asked

- **In the HTTP layer.** One new query, `getAccess({ projectId, userId })`, returning the asker's
  role in the project or nothing, and two small middleware functions named on the route's own line,
  `requireMember` and `requireLead`. Nothing → 404, the same answer as a project that does not
  exist — slice C's rule that "not yours" and "not found" are the same answer. A role too low →
  403, because an Associate can already see the project, and pretending it is not there is a lie
  they can disprove.
- **In `queries.ts`.** Every write takes the asker's id and refuses in its own SQL, so the check and
  the write cannot come apart. Closer to a lock, but it rewrites twenty functions and their tests
  before the first endpoint exists.

**Recommended: the HTTP layer.** Section 4 already says permission is role-level — "answerable from
their membership alone, without loading the task" — which is a lookup before the handler. And a
route that forgot its check shows it on its own line, in review.
*Accepted cost:* it is a sign. `queries.ts` stays callable by anything; the HTTP layer is only the
one door users have. The check and the write are also two statements — see the traps.

### 5. `one-place-for-project-access` — who can see a project, written once

`listProjectsForUser` holds the rule in its own `where` clause — lines 383 to 387 of `queries.ts`
on 2026-10-09: a current member; and while the project is being deleted, only its Lead, only inside
the window. `getAccess` must answer by exactly the same rule, or a project can be missing from
someone's list and still writable through the API — or listed, and refused. That is
`nothing-forces-reads-through-views` before it happens.

- Write the condition twice, and test both.
- **A view over memberships**, say `project_access`: one row for each person and each project they
  can currently see, with their role. `listProjectsForUser` and `getAccess` both read through it.

**Recommended: the view**, as migration `021`. Section 6 says this filter "cannot move into a view",
because it depends on who is asking. That is true of a view of *projects*. A view of *memberships*
carries the asker in every row — `user_id` and `role` — so the answer depends only on the row again,
which is the test section 6 itself gave.
*Cost:* a third view beside `visible_tasks` and `user_today`, and `listProjectsForUser` rewritten to
read it — proven by the tests it already has.

### 6. `response-shape` — what leaves the server

`select *` and `res.json(row)` send every column a table has today, and every column it gains
later. Step 6 adds a password hash to `users`, and `createUser` returns `*`. `project-type-drift`
would stop being a lie about types and become a leak.

The row types could not be what the frontend reads anyway: `created_at` is a `Date` in `Project`
and a string once it has been through JSON.

**Recommended:** every response is built, not forwarded — one small function per kind, naming each
field it sends — and every list is wrapped: `{ projects: [...] }`, not `[...]`. The wrapper is
section 13's asymmetric doors. Adding something beside a list later — a count, a next page — is free
inside an object, and a breaking change to a bare array. Keys in `camelCase`: a function that names
each field costs the same either way, and the frontend is TypeScript.

### 7. `unknown-body-keys` — a key the server did not ask for

Run: given `{ title, projectId, createdAt }`, `z.object` returned `{ title }` and said nothing;
`z.strictObject` refused it, with `unrecognized_keys`.

**Recommended: `z.strictObject`.** The client sends intent. A body that tries to send a fact —
`userId`, `createdAt`, `position` — is a bug in the client, and a 400 says so the first time rather
than never. It also turns section 13's principle into a test that can fail: "refuses a body that
names a user."
*Accepted cost:* a client cannot send harmless extras. There is no client yet.

---

## The pieces, in order

If the recommendations hold. Each ends in a test that can be watched failing first.

1. **Install.** `npm install express@5.2.1 zod@4.6.5`, then
   `npm install -D supertest@7.2.2 @types/express@5.0.6 @types/supertest@7.2.1`. Each has been out
   for at least three weeks; Express 5.3.0 was published the day this was written. Express 5 and
   not 4, because a rejected promise in an `async` handler reaches the error handler by itself —
   run, and it did. That is the other half of not writing forty `try` blocks.
2. **Errors get kinds** — question 3. A refactor: 150 green before, 150 green after.
3. **The app and the server, apart.** `src/app.ts` builds the pipeline and exports it;
   `src/server.ts` loads `.env`, imports the app and listens on `127.0.0.1`. Supertest needs an app
   that has not started listening. `npm run dev` runs the server with `tsx watch`. First test: a path
   that does not exist answers 404 in JSON, not with Express's HTML page.
4. **The error handler**, last in the pipeline. Tests: malformed JSON is 400; an unexpected error is
   500, and the body does not contain its message.
5. **The identity placeholder** — question 2. Test: no header, 401.
6. **`GET /projects` and `POST /projects`**, with the first Zod schema. Tests: a created project
   appears in its creator's list; a blank name is 400; a body naming a `userId` is 400.
7. **The `project_access` view**, migration `021`, and `listProjectsForUser` reading through it —
   question 5. Its existing tests are the proof.
8. **`getAccess`, `requireMember`, `requireLead`, and the two task endpoints** — question 4. Tests:
   the Lead creates a task; an Associate gets 403; an outsider gets 404, the same answer as a
   project id that names nothing; an id like `abc` is refused before it reaches Postgres.

The tests go in a new folder, `src/test_http`, beside `src/test_queries`, with the same `//CREATE`
and `//TEST` layout and the same `setup.ts`. Users are made by calling `createUser` directly: there
is no endpoint for them until step 6.

---

## Known traps

All run on 2026-10-09, except the four marked.

- **An error handler is recognised by having four parameters.** Written with three — dropping the
  unused `next` — it was never called, and Express answered with its own page instead.
- **Express's own error page carries the message and the stack.** With `NODE_ENV` unset, as it
  always is on this laptop, the thrown message and the name of the file it came from were both in
  the response body. The cure is never to reach that page: a four-parameter handler last, and a JSON
  404 just before it.
- **A database error must not be forwarded.** A duplicate email raised `23505` with
  `detail: Key (lower(email))=(ana@example.com) already exists.` — the address of an existing
  account, which is what design section 12's rate-limit question exists to protect. The handler maps
  the code to a status and a sentence of its own, and logs the rest.
- **Malformed JSON never reaches a route.** `express.json()` raises an error carrying `status: 400`
  and `type: "entity.parse.failed"`. A handler that turns every error it does not recognise into a
  500 makes a client's typo the server's fault.
- **No JSON content type, no body.** In Express 5, `req.body` is `undefined` unless `express.json()`
  parsed something. Zod then refuses with "expected object, received undefined", which is the right
  400.
- **`res.locals` is `any`.** `const n: number = res.locals.userId` passed `tsc` without a word —
  `untyped-queries-return-any`, at the one value every handler reads. Declaring `userId: string` on
  Express's `Locals` interface made the same line an error.
- **An id in the path is any text.** `abc` reached Postgres as `22P02 invalid input syntax for type
  bigint`, and twenty nines as `22003 out of range` — two 500s. `/^[1-9][0-9]{0,17}$/` accepts every
  id up to eighteen digits and refuses `abc`, `007` and `-1`.
- **`z.iso.date()` knows the calendar.** It refused `2026-02-30` and `2027-02-29`, accepted
  `2028-02-29`, and refused a timestamp. Without it, `2026-02-30` reaches Postgres and comes back as
  `22008`.
- **Express adds `X-Powered-By: Express`** to every response. `app.disable("x-powered-by")` removes
  it.
- **The order of the pipeline is part of the logic.** Who is asking (401), may they (404 or 403), is
  the body valid (400), then the handler. Validating first would tell an Associate their title is too
  short before telling them they cannot create tasks at all. *Reasoned, not run.*
- **Check, then act.** The permission check and the write are separate statements, so a Lead demoted
  between the two still writes. The same family as `view-refusals-take-no-lock`, and harmless until
  there are concurrent users. *Reasoned, not run.*
- **A task route must not trust its own path.** Not in the four endpoints, but in the first
  `/projects/:projectId/tasks/:taskId` of step 5b: the check proves the asker may act in project 1,
  and nothing yet proves that task 9 is in project 1. Every such route either finds the task within
  the project, or derives the project from the task. *Reasoned, not run.*
- **`dotenv/config` is `server.ts`'s first import**, for step 1's reason: ESM evaluates every import
  before any module body runs, and `db.ts` reads `DATABASE_URL` the moment it is imported. Not re-run
  — step 1 already paid for it.

---

## Open items step 5 meets

| Item | What step 5 does to it |
|---|---|
| `writes-dont-check-who-is-asking` | Closes endpoint by endpoint, and only there. `queries.ts` stays callable by anything |
| `lead-cannot-read-tasks-in-delete-mode` | Inherited. `GET /projects/:projectId/tasks` gives a Lead whose project is being deleted an empty list |
| `delete-mode-helper-passes-unknown-projects` | Shielded. A project that does not exist has no members, so it is 404 before `createTask` runs. The helper itself is unchanged |
| `untyped-queries-return-any`, `project-type-drift` | Meet the wire — question 6, and the `res.locals` trap |
| `titles-and-notes-have-no-length-limit`, `email-has-no-format-or-length-limit` | Zod can hold a limit at the boundary. The numbers are a product decision, not step 5's |
| `visible-projects-filter-arrives-with-delete-mode` | Closed by this preparation: it arrived in slice C, and nobody had marked it. Its concern — one place deciding — comes back as question 5 |
