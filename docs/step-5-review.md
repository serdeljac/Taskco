# Steps 5 and 6 — review

Written 2026-10-24, after steps 5 and 6 were built on branch `step-5` between 2026-10-10 and
2026-10-22. Step 5 is the HTTP layer: thirty-nine endpoints in `src/app.ts`, and refusals that
carry a kind. Step 6 is authentication: Argon2id passwords, and sessions named by a cookie.
Migrations 021–023, three hundred and ninety-four tests. It is one review because step 6 was built
on step 5's branch and replaced the first thing every request goes through.

Companion to [`design-decisions.md`](./design-decisions.md), [`learning-path.md`](./learning-path.md),
[`step-5-prep.md`](./step-5-prep.md) and the earlier reviews — [`slice-a-review.md`](./slice-a-review.md),
[`slice-b-review.md`](./slice-b-review.md), [`slice-c-review.md`](./slice-c-review.md),
[`step-4b-review.md`](./step-4b-review.md), [`step-4c-review.md`](./step-4c-review.md).

Reads the same way as the others. Every piece gets **Protects**, **Doesn't protect** and
**Assumes**, and every rule is either a **lock** — in the database, refusing bad data from anywhere —
or a **sign**, in our code, which only works for writes that go through it. The HTTP layer adds a
third question: **what the asker is told.** A request can leave the data exactly right and still get
the wrong answer, and a frontend acts on the answer.

**This file does not track status.** It is dated. Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**Every behaviour claimed here was run against `taskco_test`** before it was written down, except
the ones marked as reasoned. The runs went through the real app, listening on a random port, from a
throwaway script that emptied the tables afterwards. And as in every review, nothing here came from
a failing test: all 394 pass, in file order and shuffled (seed 2410), and the type check is clean.
Both databases have all twenty-three migrations.

---

## Everything this review raised

| # | Name | Open item | Where |
|---|---|---|---|
| 1 | `racing-logins-answer-409` | Two logins at once to an account being deleted: one reopens it, and the other is told 409, "account not found, or not inside its deletion window". Four rounds in five | `logIn`, `reopenAccount` |
| 2 | `gone-account-still-holds-its-address` | Past its date and before the purge, an account cannot log in, but its address cannot register again, and can still be invited. For accounts the purge changes answers, which section 6 says a purge never does | `registerUser`, `createInvite`, the purge |
| 3 | `parser-refusals-answer-500` | `express.json()` refuses an unknown charset or content encoding with its own 415. The error handler only knows two of its refusals, so both answer 500 and print a stack | `handleErrors` |
| 4 | `bodyless-posts-trust-samesite-alone` | Three `POST`s take no body, so "bodies are JSON" does not protect them. Only `SameSite` does, and it does not tell apart two apps on `localhost`, or two subdomains of one host | `app.ts`, design §15 |
| 5 | `delete-mode-answers-three-ways` | The Lead of a project being deleted gets 200 with an empty list, 404 or 409, depending on whether the path names the project or a task | `app.ts`, the views |
| 6 | `move-accepts-the-task-as-its-own-neighbour` | A move naming the task as its own neighbour answers 204. One way writes two tasks at the same position, the other moves the task to the top | `moveTask` |
| 7 | `login-leaves-the-replaced-session-alive` | Logging in again from the same browser replaces the cookie, and the session it replaced keeps working for the rest of its thirty days | `POST /sessions` |
| 8 | `undo-answers-409-for-an-unknown-routine` | A routine that does not exist is 404 to complete and to count, and 409, "not completed today", to undo | `undoCompletion` |
| 9 | `frontend-origin-not-decided` | A browser's preflight from another origin is answered 401 with no CORS headers, so a frontend on Vite's own port cannot call the API at all. Proxy or CORS is undecided | `app.ts`, step 7 |
| 10 | `node-24-not-declared` | `argon2` arrived in `node:crypto` in Node 24.7, and nothing in the project says so. On an older Node the server will not start | `package.json` |

**Items 1, 3 and 6 are the three worth fixing before merging** — see the end. Items 4, 5 and 9 are
decisions that belong in step 7's preparation, and item 2 belongs with purging.

Four items already open gained evidence: `lead-cannot-read-tasks-in-delete-mode` (section 5),
`deactivated-accounts-can-still-be-invited-or-added` and `purge-runs-only-by-hand` (section 4),
and `races-answer-500` (section 7). Three status lines in the docs were out of date, and are corrected
in the same commit as this file — section 10.

### Deliberately allowed

- **Registering reveals whether an address has an account.** Accepted in design section 15;
  `registration-reveals-accounts`.
- **Logging out ends one session**, not every session of the account. Section 15.
- **`POST /account/deletion` leaves the cookie in the browser.** Run: the 201 carries no
  `Set-Cookie`. The session behind the cookie is gone, so the next request is 401, "Log in first",
  which is the answer a frontend needs to show the login screen.
- **A refusal's words are sentences written for the terminal.** Already
  `refusal-reasons-are-developer-sentences`; step 7 will show which ones a person sees.

---

## 1. The migrations — 021, 022 and 023

**021** is an index, not a rule. Its reasoning is in the progress log.

**022 — Protects**, a lock: `password_hash` is empty, or starts `$argon2id$`, so a password cannot
be stored as plain text by mistake.

**Doesn't protect** — that the rest of the string can be read. Run: `$argon2id$not-a-hash` passes the
check, and logging in to that account answers 500, from `verifyPassword`'s "the stored string is
not an Argon2id hash". Only a hand-written `update` can get it there. The lock checks the prefix, and
the reader needs the whole format.

**Assumes** — that every hash is written by `hashPassword`.

**023 — Protects**, all locks: a session holds 64 hex characters, so a raw token, which is
base64url, cannot be stored in its place; a session belongs to a real account and goes with it; and
it ends after it begins.

**Doesn't protect** — nothing it is responsible for. Whether a session is live is derived, in
`findSessionUser`, and does not need storing.

**Assumes** — that every token comes from `createSession`.

## 2. Passwords — `src/passwords.ts`

**Protects**

- Each stored string records its own settings, so raising them later leaves older passwords
  checkable. The test for it goes red with today's settings in their place (checked while step 6 was
  built).
- The comparison takes the same time however early a guess goes wrong.
- **A failed login takes the same time whatever the reason.** Run: fifteen of each, interleaved,
  through `POST /sessions`.

  | Attempt | Median | Range |
  |---|---|---|
  | Wrong password | 38.5 ms | 36.9–42.2 |
  | Email nobody has | 38.8 ms | 37.1–41.3 |
  | Account with no password | 39.9 ms | 37.0–43.6 |
  | Account past its date | 39.4 ms | 37.9–43.4 |
  | Right password, for comparison | 41.5 ms | 39.9–44.2 |

  The four failures cannot be told apart at this resolution. The right password is slower by the
  session it writes, and only someone who already knows the password can see that.

**Doesn't protect** — two things, both reasoned rather than run, and neither reachable today:

- **The first email-nobody-has after the server starts** takes two hashes, because `hashForNobody`
  makes its hash the first time it is asked. Once per process.
- **Raising the settings would undo the equal timing.** The nobody hash would use the new settings,
  while every older account's hash still checks with the old, cheaper ones — so a wrong password for
  an old account would answer faster than an email nobody has. Nothing rehashes a password at login.
  Whoever raises the settings needs to add that.

**Assumes** — Node 24.7 or later, which is when `argon2` reached `node:crypto`. **Nothing in the
project says so** — `package.json` has no `engines`, and there is no `.nvmrc`. On an older Node the
import fails before the server starts, with an error about a missing export rather than about the
version. *(item 10)* Reasoned; this laptop has only Node 24.14.

## 3. Sessions — `createSession`, `findSessionUser`, `endSession`

**Protects**

- A token is 32 random bytes, and only its SHA-256 is stored.
- A session counts only before its end, and only while its account is not being deleted.
- Deleting an account ends every one of its sessions; logging out ends the one it was sent with.

**Doesn't protect** — **the session a second login replaces.** Run: Ana logs in, then logs in again
from the same browser, sending the first cookie. She has two sessions, and the first cookie still
answers 200 on `GET /account`. The browser has forgotten that token, but whoever else held it has
not, for thirty days. `POST /sessions` could end the session the request arrived with, if there is
one, before making the new one. *(item 7)*

**Assumes** — that the cookie is the only copy of the token.

Expired sessions join `purge-runs-only-by-hand`. Harmless, since nothing counts them.

## 4. `logIn` and `registerUser`

**Protects**

- The same answer, in the same time, for every failed login — section 2.
- **Two registrations for one address at once.** Run, as `ana@` and `ANA@` together: one 201, one
  409, "an account already uses that email". `registerUser` lets the index refuse rather than checking
  first, so there is no gap to race through.
- An unknown timezone is refused by migration `020`'s lock, and turned into a sentence: 409.

**Doesn't protect**

- **Two logins at once to an account being deleted.** *(item 1)* Run five times, re-deleting the
  account before each round. Round 1 gave two 201s. Rounds 2 to 5 each gave one 201 and one **409,
  "account not found, or not inside its deletion window"**. Both logins read the account as being
  deleted, both check the password side by side for 40 ms, and both call `reopenAccount`. The
  second finds nothing left to reopen, and refuses. Afterwards the account is open with one session.
  The data is right, and someone who typed the right password was told something else. A double-click
  on "Log in" is enough. It is a sibling of `reopen-and-session-are-two-steps`.

- **An account past its date keeps its address until the purge runs.** *(item 2)* Run: logging in
  is 401, as designed. But registering the same address again is **409, "an account already uses
  that email"**, and a Lead can still invite it — 201. After `purgeDeletedAccounts`, registering is
  201.

  Design section 6 says of the project purge that "whether it runs on the first of the month, the
  twentieth or never, nobody sees anything different". That holds for projects. It does not hold for
  accounts: here two answers change when the purge runs, which by section 13's own test makes it state
  rather than cleanup. The invite half was already `deactivated-accounts-can-still-be-invited-or-added`;
  the registration half is new. Either `registerUser` and `createInvite` treat an account past its
  date as absent, or the purge runs on a timer — which shortens the window and does not close it.
  A decision first.

**Assumes** — nothing beyond its own `where` clauses.

## 5. Who is asking, and may they

**Protects**

- Only the two routes above "who is asking" are public. Every other route is 401 without a live
  session, and `X-User-Id` no longer gets anyone in (test).
- An id in a path that cannot be an id is 404 before it reaches Postgres; one in a body is 400.
- **A task or subtask's project is found through it, never taken from the path.** The preparation
  listed "a task route must not trust its own path" as a trap for step 5b. It cannot arise: every task
  route is `/tasks/:taskId`, so no path names both.
- **The order is 401, then 404 or 403, then 400.** The preparation had this as reasoned, not run.
  It is a test now: "answers 403 to an Associate before looking at the body".
- No row of `users` leaves with its `password_hash`: `getUser`, `registerUser` and `createUser` name
  their columns, and two tests check the response.

**Doesn't protect**

- **One reason, three answers.** *(item 5)* Run as Ana, the Lead of a project in delete mode:

  | Request | Answer |
  |---|---|
  | `GET /projects/:projectId/tasks` | 200, `{ "tasks": [] }` |
  | `GET /projects/:projectId/members` | 200, both members |
  | `POST /projects/:projectId/tasks`, `/invites`, `/transfer`; `DELETE …/members/:userId` | 409, "the project is being deleted" |
  | `PUT /tasks/:taskId/status`, `DELETE /tasks/:taskId`, `GET /tasks/:taskId/subtasks`, `PUT /subtasks/:subtaskId/status` | 404, "Not found" |

  The rule behind every row is the same, and nothing was written that should not have been. What
  differs is the path. A route that names the project gets through `requireLead`, because the Lead
  still sees a project being deleted, and reaches a writer that says why. A route that names a task
  finds its project through `visible_tasks`, which hides every task in a project being deleted, so
  the task is "not found" — to the one person design section 6 says can still read it. That is
  `lead-cannot-read-tasks-in-delete-mode` again, now with a status code. Step 7 has to draw a
  project being deleted, and needs one answer to draw from.

- **Check, then act** — still reasoned, not run. `check-then-act-in-the-http-layer`.

**Assumes** — that `listProjectsForUser` is the one place that decides who can see a project.

## 6. The routes

**Protects**

- Every body is a strict object, so a key the server did not ask for is 400.
- **Zod's refusals do not repeat what was sent.** Run: a password of "short" comes back as
  `too_small`, with its path and minimum and no value. A 129-character password is nowhere in its 400.

**Doesn't protect**

- **A task as its own neighbour.** *(item 6)* Run on A, B and C, at 65536, 131072 and 196608:
  - `PUT /tasks/A/position { afterTaskId: A }` → 204. A moves to 131072, **the same position as B**.
    The order holds only by the `id` tiebreaker.
  - `PUT /tasks/B/position { afterTaskId: B, beforeTaskId: B }` → 204. There is no room between B and
    itself, so `moveTask` renumbers. It looks for B among the *other* tasks, does not find it, and
    puts B **at the top**.

  A drag library will not send either. A frontend bug would, and the second answers success while
  moving the task somewhere nobody asked for. Refusing a neighbour that is the task itself is one
  condition, in the schema or in `moveTask`.

- **An unknown routine, three ways.** *(item 8)* Run on routine 999: `PUT …/completions/today` is
  404, `GET …/streak` is 404, and `DELETE …/completions/today` is **409, "not completed today"**. The
  step 4c review accepted those words, as true of the asker. Over HTTP the kind matters as well, since
  a client branches on 404 and 409 differently. Low.

**Assumes** — that every route which reads `res.locals.project` names `requireMember` or
`requireLead`. TypeScript says it is always there; it is set only by those two.

## 7. Errors — `handleErrors`

**Protects** — broken JSON is 400; a body over 100 kB is 413; `NotFound` is 404; `Refused` is 409,
with the function's name taken off; anything else is 500, one sentence, and the whole error in the
terminal.

**Doesn't protect** — **the parser's other refusals.** *(item 3)* Run:

- `Content-Type: application/json; charset=latin1` → **500**. The terminal shows
  `UnsupportedMediaTypeError: unsupported charset "LATIN1"`, `type: 'charset.unsupported'`.
- `Content-Encoding: compress` → **500**, `encoding.unsupported`.

`express.json()` gave both a status of its own, 415, marked safe to show. The handler looks at
`type`, and knows two values. The preparation named the trap — "a handler that turns every error it
does not recognise into a 500 makes a client's typo the server's fault" — and the build closed it for
the two cases it tried. Answering the parser's own status whenever it is a 4xx would close the rest.
This is the same family as `races-answer-500`, with one difference: these can be reached on purpose,
so they can be tested.

**Assumes** — that every error worth a 4xx is one of the four it names.

## 8. The cookie, and requests from other sites

**Protects** — the cookie is `HttpOnly`, `Secure` and `SameSite=Strict`, each checked by a test.
Every route that takes a body takes JSON, which a form cannot send. Run: `POST /projects`, sent
form-encoded, is 400.

**Doesn't protect**

- **Three `POST`s take no body.** *(item 4)* `POST /projects/:projectId/deletion`,
  `POST /invites/:inviteId/accept` and `POST /account/deletion`. Run: the first and the last, sent
  form-encoded with `Origin: http://localhost:5174` and `Sec-Fetch-Site: same-site`, each answered
  **201**. The server looks at neither header, so for these three `SameSite` is the whole defence.

  *Reasoned, not run in a browser:* `SameSite` compares *sites*, and a site ignores the port and the
  subdomain. Another app on `localhost`, on any port, is the same site as Taskco on `localhost:3000`.
  Once hosted, so is any other subdomain of the same domain. A form on either would carry the cookie.
  Design section 15's "Bodies are JSON as well, which a form on another site cannot send" holds for the
  routes that have a body, and these three do not.

  Two small defences, either enough:
  - Refuse a request that changes something when its `Sec-Fetch-Site` is present and is neither
    `same-origin` nor `none`.
  - Or refuse one that does not say `Content-Type: application/json`. A form cannot send that, and a
    script on another origin can only after a preflight, which is refused.

  Naming the cookie `__Host-taskco_session` would also stop a sibling subdomain from *setting* it.
  Which defence fits depends on item 9.

- **The frontend's origin.** *(item 9)* Run: `OPTIONS /projects` from `Origin: http://localhost:5173`,
  asking to `POST` with a `content-type` header, is **401, "Log in first"**, with no
  `Access-Control-Allow-Origin`. So a frontend served by Vite on its own port cannot call the API at
  all: the browser's preflight is turned away by "who is asking". There are two ways out.
  - **Vite's dev proxy.** The browser sees one origin, CORS never arises, and the cookie stays
    first-party.
  - **CORS on the server.** That means credentials, an allow-list, and `OPTIONS` answered above "who is
    asking".

  The first leaves less to get wrong. Choosing settles item 4's defence, and
  `secure-cookie-needs-a-secure-origin` as well.

## 9. The tests

**Protects** — 394: 195 through HTTP, 199 against `queries.ts`, in twenty-one files, passing in file
order and shuffled. The reference lists the rules that were removed for one run each to watch their
tests go red.

**Doesn't protect** — behaviours that hold or fail with no test, every one run for this review:

- items 1, 3, 6 and 7;
- the 404 a Lead gets on a task route in delete mode (item 5);
- a hash that passes migration `022`'s lock and cannot be read (section 1).

The equal timing has no test, and cannot reliably have one; the table in section 2 is its evidence,
dated.

**Assumes** — as ever, that everything goes through `queries.ts`. And since `cookieFor` makes
sessions directly, only `sessions.test.ts` logs in through `POST /sessions`, as the reference says.

## 10. What the docs said

Three status lines were out of date, and are corrected in the same commit as this file:

- **`learning-path.md`** said the branch was "not merged or pushed". `origin/step-5` was pushed on
  2026-10-22 at 22:23, three hours after that line was committed.
- **`open-items.md`, `email-has-no-format-or-length-limit`**, said "no endpoint creates a user until
  step 6". `POST /users` has refused an address that is not one, or is over 254 characters, since
  step 6.
- **`open-items.md`, `purge-runs-only-by-hand`**, named projects and accounts. Expired sessions wait
  for the same hand since step 6.

Left alone: the step 5 section of `reference.md` still shows `X-User-Id` in places, but it introduces
itself as a snapshot taken before step 6. Design section 15's sentence about JSON bodies waits for
item 4 to be decided.

---

## The three worth fixing before merging

None needs a migration. Each is a change to code with a test that can be watched failing first.

**Item 1 — a second login must not be refused for the first one's reopening.** Inside `logIn`, a
reopening that finds the account already open is not a failure: the password was right, and the
account is open, which is what the person asked for. Item 7 lives in the same route, and is one more
line: end the session the request arrived with.

**Item 3 — answer the parser's own 4xx.** One condition in `handleErrors`, and two tests from the runs
above — 415 for each, not 500.

**Item 6 — refuse a task as its own neighbour.** In the `position` schema or in `moveTask`. The
second, if the rule should hold for anything that calls it, not only for HTTP.

Item 8 is small enough to go with them, once it is decided whether undoing a routine that does not
exist is 404 or 409.

---

## Decisions these steps changed or recorded

All in [`design-decisions.md`](./design-decisions.md), sections 14 and 15:

- **One endpoint at a time, and no step 5b** — the preparation proposed four endpoints and a second
  step.
- **Refusals carry a kind**, `NotFound` or `Refused`, so a status is chosen without reading words.
- **"May they?" is asked on each route's own line**, by `requireMember` or `requireLead`; an
  Associate gets 403, someone who cannot see the project 404.
- **No `project_access` view**: the check reads the asker's own project list.
- **Rows are forwarded as they are**, wrapped in lists; a key the server did not ask for is refused.
- **Session cookies, not signed tokens; Argon2id from `node:crypto`, not a package.**
- **Logging in reopens an account being deleted**, so `DELETE /account/deletion` was removed.
- **How the work proceeds**: since 2026-10-22, Claude writes the tests and the code, and Stjepan
  reviews the commits.
