# Step 7 — preparation

Written 2026-10-24, after steps 5 and 6 were reviewed, fixed and merged into `main`, and before
step 7 is specified. Companion to [`design-decisions.md`](./design-decisions.md) and
[`learning-path.md`](./learning-path.md), step 7. Built the way [`step-5-prep.md`](./step-5-prep.md)
was.

**This file is a dated snapshot, like the reviews.** It holds what step 7 starts from, ten questions
to answer before its first line, the order the first pieces would go in, and the traps waiting in
them. When a question is answered, the decision moves into `design-decisions.md`, and this file is
not edited to match. Whether something is still open is answered in [`open-items.md`](./open-items.md).

**Every browser and library behaviour claimed here was run.** That means a throwaway Vite project —
Vite 8.3.2, React 19.3.0, React DOM 19.3.0, React Router 8.4.0 — proxying to the real API on
`taskco_test`, driven from the Claude desktop app's built-in browser. The test tables were emptied
afterwards. The other packages in the install list were looked up — versions, dates, what they
require of each other — and not run. The claims that were reasoned rather than run are marked.

---

## What step 7 starts from

- **Thirty-nine endpoints, all JSON.** Every one except `POST /users` and `POST /sessions` answers
  401, "Log in first", without a live session. [`reference.md`](./reference.md) lists them with who
  may call each one, what each answers, and how each refuses.
- **The session is a cookie no script can read.** `taskco_session`: `HttpOnly`, `Secure`,
  `SameSite=Strict`, thirty days. Run: after registering, `document.cookie` was empty, and the
  response's `Set-Cookie` header read as `null`. The browser sent the cookie back on every later
  request by itself. **So the frontend can only learn whether someone is logged in by asking:**
  `GET /account` was 401 before registering and 200 after.
- **What the wire carries** (design section 14). Lists are wrapped, `{ projects: [...] }`, and so
  are single things, `{ task }`. Keys are `snake_case`. Ids are strings — run: `"1"`, `typeof`
  `"string"`. Due dates are calendar labels, `"2026-09-25"`. Timestamps are ISO strings in UTC —
  run: `created_at` was `"2026-10-24T19:00:08.932Z"`, a `string`. **Nineteen of the thirty-nine
  endpoints answer 204, with no body at all.**
- **How it refuses.**
  - 400, with Zod's `issues`.
  - 401, 403 and 404, each with a fixed sentence.
  - 409, with a sentence written for the terminal.
  - 413, and 415 or 400 for "The request cannot be read".
  - 500, "Something went wrong".
- **The stack is chosen** (design section 11): React, Vite, TypeScript, SASS, React Router, `fetch`,
  and `dnd-kit` once there is a list to drag. **Nothing is installed, and how the frontend is tested
  is not chosen.**
- **Two rules disagree about who writes it.** The learning path's step 7 says "hand-coded as its own
  learning exercise". Its rules, since 2026-10-22, say Claude writes the code and Stjepan reviews it.
- **Some screens the design describes have no endpoint yet.**
  - Renaming anything, which is not even decided.
  - Moving subtasks.
  - The former members list.
  - The count of subtask dates a move would clear, shown before it happens.
  - Editing or deleting a routine.
  - Changing the account's timezone — design section 8 says "changeable in settings", and no
    function does it; logged now as `no-timezone-change`.
  - Export.
  - Notifications.

  Each is an open item, listed at the end with the slice it would meet.
- **`src/preview.ts`**, slice B's throwaway page, is due to be deleted in this step.

The learning path estimates 60 to 100+ hours — more than the whole backend.

---

## The ten questions

Named like open items, so they can be referred to by name. Each has a recommendation. None is
decided.

### 1. `who-writes-the-frontend`

React, TypeScript and SASS are learning targets, and the frontend was always meant to be learned by
building it. But the reason the way of working changed on 2026-10-22 still holds: typing every line
had become the slowest part, and it taught least on the fifth copy of something.

- **Stjepan types every line**, with `path:line` for each piece, as before 2026-10-22. The most
  learning per line, and the slowest by far, on the largest step.
- **Claude writes it all**, test-first and one commit per idea, as for step 5's last thirty-four
  commits; Stjepan reviews. The fastest. But reviewing React without having written any is harder
  than reviewing SQL was, because the shape of a component is not yet familiar.
- **Stjepan writes the first of each kind of thing; Claude writes the copies.** This is how step 5
  went before the change. `GET /projects` was typed by hand, and `GET /routines` and `GET /invites`
  followed as copies. In step 7a, the firsts are:
  - a component that shows what it is given;
  - one that keeps state — the login form;
  - a route;
  - a loader that fetches;
  - a SASS module;
  - a component test.

  After that, a new kind of thing is typed once, and its copies are written for him.

**Recommended: the third.** Each concept is met by writing it once, which is the part that
teaches. The copies are review. Whichever is chosen, the learning path's rules get the new wording,
as on 2026-10-22.

### 2. `api-origin` — how the browser reaches the API

Run: from a page on Vite's own port, even a plain `GET` to the API's port fails with
`TypeError: Failed to fetch`. The API sends no CORS headers, so the browser withholds its answer
from the page. A JSON write would not get that far: the review found its preflight answered 401 by
"who is asking".

- **CORS on the server.** It means answering `OPTIONS` above "who is asking", an allow-list of
  origins, `credentials: "include"` on every `fetch`, and a preflight before every JSON write. Once
  hosted, if the frontend and the API ever sit on different sites, `SameSite=Strict` stops the
  cookie. The fix for that is `SameSite=None`, which gives up the defence against cross-site
  requests.
- **Vite's dev proxy**: the browser sees one origin, and CORS never comes up. **Run end to end** in
  the built-in browser, with a page on `http://localhost:5199` proxying `/api` to the real API:
  - registering was 201;
  - the `Secure` cookie was kept on plain `http://localhost` and sent back through the proxy;
  - `GET /api/account` was 200;
  - every write reached the API with `Origin: http://localhost:5199` and
    `Sec-Fetch-Site: same-origin`.

  Hosted, the same shape means the built frontend and the API served from one origin. That makes
  "one origin" a constraint to carry into the hosting decision.

**Recommended: the proxy.** That leaves where the `/api` prefix lives. A prefix is needed: without
one, `/projects/1` would be both a page and an endpoint. Run: through the proxy, `/projects/1` came
back as Vite's `index.html` — a page — while `/api/...` reached the API.

- **The proxy strips `/api`**, as the run did. The server is unchanged, but whatever serves it once
  hosted must strip `/api` the same way.
- **`server.ts` mounts the app under `/api`**: `express().use("/api", app)`. Run: mounted, `/api/account`,
  `/api/nowhere` and `/api/projects/abc/tasks` answered exactly as before. The tests import `app`
  directly, so not one of them changes. The `curl` lines in the reference gain `/api`.

**Recommended: mount it in `server.ts`**, so the path in the browser's network tab is the path the
server routes, in development and once hosted alike.

### 3. `request-origin-check` — the three `POST`s with no body

The review's `bodyless-posts-trust-samesite-alone`. Three `POST`s take no body:
`POST /projects/:projectId/deletion`, `POST /invites/:inviteId/accept` and `POST /account/deletion`.
For them, `SameSite` is the only defence, and it treats another app on `localhost`, or a sibling
subdomain, as the same site. The answer to question 2 decides which fix fits.

- **Check Fetch Metadata.** Refuse a request that changes something — any method but `GET`, `HEAD`
  and `OPTIONS` — when it carries a `Sec-Fetch-Site` header saying anything other than
  `same-origin`. Run: through the proxy, every write said `same-origin`. A request with no such
  header passes, which is every test, and `curl`.
- **Require `Content-Type: application/json` on every write.** A form cannot send it. But the
  frontend would then need to send a content type on a `DELETE` that has no body.

**Recommended: Fetch Metadata**, as the first thing in the pipeline, above the two public routes, as
a 403. *Accepted cost:* a browser too old to send the header is protected by `SameSite` alone.
Naming the cookie `__Host-taskco_session`, which stops a sibling subdomain from setting it, waits for
hosting.

### 4. `step-7-scope` — slices, each ending in something a person can click

The backend was sliced so that each step ended in something provable. The frontend can be sliced
the same way, by what a person can do at the end:

| Slice | A person can | Meets |
|---|---|---|
| **7a** | register, log in, stay logged in across a reload, see their projects, create one, log out | questions 1–3, 5–8, 10 |
| 7b | open a project, see its tasks in order, create one, and change status, priority, due date, notes and assignee; see its members | `due-date-confirmation-not-built`, `not-before-today-not-built`, `no-renaming` |
| 7c | open a task's subtasks, and do the same to them | `no-subtask-moves` |
| 7d | drag a task to a new place | `dnd-kit` arrives |
| 7e | invite, accept, decline, remove, leave, transfer; delete mode and its banner | question 9, `no-former-members-list` |
| 7f | routines: create, complete today, undo, streaks | `streaks-are-one-query-per-routine`, `routines-cannot-be-edited-or-deleted`, `undo-answers-409-for-an-unknown-routine` |
| 7g | delete their account: the list of projects they lead, transfer or delete each, then go | `account-deletion-list-not-built` |

**Recommended: specify 7a now, and each later slice when it is reached.** That is step 5's
one-endpoint-at-a-time, at the size of a screen. 7a carries almost every decision in this file. The
later slices mostly repeat its patterns, and each meets the open items in its row.

### 5. `frontend-layout` — where the frontend lives, and how it is checked

**Recommended:** a `web/` folder in this repository. It gets its own `package.json`, `tsconfig.json`
(DOM types, JSX, bundler module resolution), `vite.config.ts` and Vitest setup, and its own
`npm install`. The root stays the API. Two terminals in development: `npm run dev` at the root,
`npm run dev` in `web/`.

Two things the root must learn:

- **Run:** the root `vitest.config.ts` names no `include`, so `npm test` collects test files from
  anywhere in the repository. A test placed outside `src` was collected, and run with the root setup,
  which empties `taskco_test` before each test, in Node, where `document` is `undefined`. The root
  config needs `include: ["src/**/*.test.ts"]`.
- The root `tsconfig.json` includes only `src`, so `npm run typecheck` will not see `web/`. That is
  right: `web/` gets its own `typecheck`.

*Rejected — npm workspaces:* a third concept to learn this week, and easy to add later.
*Rejected — a second repository:* a change that needs both sides would become two commits in two
places.

### 6. `routing-and-loading` — which React Router, and where data is fetched

React Router 8 offers three modes. Its own docs describe each as adding to the one before: features,
at the cost of architectural control.

- **Declarative** — `<BrowserRouter>` matches URLs to components; every screen fetches its own data
  in an effect. **Run:** in React's development `StrictMode`, an effect that creates something "once,
  when the screen opens" created **two** projects. A load that runs twice is harmless, but has to be
  written to tolerate it. Two loads racing when someone clicks quickly — *reasoned* — has to be
  handled by hand on every screen.
- **Data** — `createBrowserRouter` and `RouterProvider`. Routes declare a `loader`, which fetches
  before the screen renders, and an `action` for a form; the docs list "data loading, actions,
  pending states". A loader at the root could ask `GET /api/account` and `redirect` a 401 to
  `/login` — *reasoned, from the docs*.
- **Framework** — Data mode wrapped in a Vite plugin with its own conventions. That is the
  framework-shaped choice Next.js was rejected for in section 11.

**Recommended: Data mode**, with `fetch` underneath, as section 11 says. Loading becomes something a
route declares, rather than something every screen hand-manages. An effect is still learned — for
what is an effect — but loading is not one. TanStack Query stays where section 11 put it: only if
this becomes painful.

### 7. `wire-types` — the types the frontend reads

Design section 11 chose TypeScript on both sides "so task/membership/role types are written once".
**That does not hold at the wire.** `queries.ts` says `created_at: Date`, and what arrives is a
string. Run, above. Every timestamp in every row type is wrong on the far side of `JSON.stringify`.

- **Import the server's row types** — written once, but wrong about every timestamp. And `queries.ts`
  imports `pg` and `node:crypto`, so type-checking it from `web/`, with DOM types and no Node types,
  would pull the server into the frontend's check. *Reasoned.*
- **A file of wire types in `web/`**, written by hand from the reference's endpoint tables: ids and
  timestamps as `string`, and due dates as a named alias of `string`, so a label is never mistaken for
  a moment.
- **Check every response with Zod** — the strongest answer to `project-type-drift`, and a schema per
  response.

**Recommended: the file of wire types**, and correct section 11's sentence when it is decided.
*Accepted cost:* a column added to a table reaches the frontend untyped, and a column renamed breaks
it silently — the wire half of `project-type-drift`. Zod at the boundary is the step up, if that
bites.

### 8. `refusal-words` — what a person reads when something is refused

`refusal-reasons-are-developer-sentences` is now due. Some endpoints refuse more than one way, with
the same status. `POST /projects/:projectId/invites` has three 409s:

- "No email found";
- "they are already a member of this project";
- "the project is being deleted".

A screen wants different words for each.

- **Show the `error` text as it comes** — the server's sentences would have to be rewritten for
  people. The server would then own the words on the screen.
- **Match on the text** — exactly what `error-kinds` was built to avoid: rewording a message would
  break a screen.
- **Give each refusal a stable code** beside its message: `{ error, code: "no-account" }`. Codes are
  named the way open items are, and never change. The frontend turns a code into its own words, and
  shows one general sentence for a code it does not know.

**Recommended: codes.** That means a refactor of the twenty-four `Refused` in `queries.ts`, and the
error handler sending `code`, before the first screen that shows a refusal. No migration. A 400's
`issues` are Zod's English, so the frontend checks the same rules before sending — eight characters
for a password, a name that is not blank — and words them itself. Zod stays the server's check.

### 9. `delete-mode-screen` — what the Lead of a project being deleted sees

The review's `delete-mode-answers-three-ways`. `GET /projects` gives the Lead the project with its
`deletion_scheduled_at`. Then:

- its tasks answer 200 with an empty list;
- any task route answers 404;
- any write answers 409.

Section 6 says the Lead "can still read it, and export it, and undo".

- **A banner, and nothing else.** The project's page says when it will be deleted, offers "Undo" and
  "Delete now", and does not ask for its tasks. This is what the API supports today.
- **Build the Lead's read first** — `lead-cannot-read-tasks-in-delete-mode`, reads that go around the
  views for the Lead — then show the tasks read-only under the banner.

**Recommended: the banner**, for step 7. Undo is what turns the thirty days into a safety net, and it
works. Reading waits for export, which is the reason the Lead would need to read at all. The
Associate's side — the project leaves their list with nothing said — stays with
`delete-mode-notifies-nobody`.

### 10. `frontend-tests` — how the frontend proves anything

The backend's standard is "tests assert failures". For a screen, a failure is the wrong thing shown:

- a wrong password that says nothing;
- a refusal shown as a crash;
- a 401 that leaves someone on a page that cannot load.

- **Component tests**: Vitest in `jsdom`, with Testing Library — rendering a component and acting as
  a person would. `fetch` is replaced by a stand-in in these tests, so they test the screen, not the
  API.
- **End-to-end**: Playwright or similar, driving a real browser through real flows against the real
  API. The closest to the truth, and a new tool with browsers of its own to install.
- **By hand only**: no.

**Recommended: component tests, written first like every test so far**, for anything with behaviour:
the API client's handling of each kind of answer, forms, what a refusal shows, the 401 rule. Each
slice ends with its flows checked by hand in a real browser, as this preparation did. *Accepted
cost:* a stand-in `fetch` can disagree with the real API. Revisit end-to-end at 7g, where one flow
crosses five screens.

---

## The pieces of 7a, in order

If the recommendations hold. Each ends in a test that can be watched failing first, or in a check
that can.

1. **The root collects only its own tests.** `include: ["src/**/*.test.ts"]` in
   `vitest.config.ts`. Proof: `npx vitest list` still lists four hundred and three tests, and a test
   placed outside `src` no longer runs.
2. **The API under `/api`.** `server.ts` mounts `app` there. No test changes.
3. **The Fetch Metadata check**, test-first: a write marked `same-site` or `cross-site` is 403 and
   changes nothing; one marked `same-origin`, or unmarked, goes through.
4. **Refusal codes**, a refactor commit: every existing test stays green, and the HTTP tests for
   refusals gain a check of `code`.
5. **Install `web/`.** Every version was published at least three weeks before this was written,
   checked against what each package requires of the others. Install with `--save-exact`.

   | Package | Version | Published |
   |---|---|---|
   | `react`, `react-dom` | 19.3.0 | 2026-09-09 |
   | `react-router` | 8.4.0 | 2026-09-15 — needs React 19.2.7 and Node 22.22 or later |
   | `vite` | 8.3.2 | 2026-10-01 |
   | `@vitejs/plugin-react` | 6.1.1 | 2026-08-28 — needs Vite 8 |
   | `typescript` | 7.0.2 | 2026-07-08 — the root's version |
   | `@types/react`, `@types/react-dom` | 19.3.0 | 2026-09-09 |
   | `sass-embedded` | 1.105.1 | 2026-09-29 |
   | `vitest` | 5.0.3 | 2026-09-30 — accepts Vite 8 |
   | `jsdom` | 30.1.1 | 2026-09-22 |
   | `@testing-library/react` | 16.3.3 | 2026-08-27 |
   | `@testing-library/dom` | 10.4.2 | 2026-09-13 |
   | `@testing-library/user-event` | 14.6.7 | 2026-09-02 |

   `web/package.json` also declares `engines`, Node 24.7 or later — and the root's does too, closing
   `node-24-not-declared` on the way.
6. **The `web/` skeleton**: `index.html`, `main.tsx`, the proxy in `vite.config.ts`, and one
   component test seen failing, then passing.
7. **The API client** — one function every screen calls. It adds `/api`, sends JSON, checks
   `res.ok`, reads no body from a 204, and throws an error carrying the status and the `code`.
   Its tests are the traps below.
8. **The router**, in Data mode, with the root loader asking who is logged in, and a 401 anywhere
   going to `/login`.
9. **Registering** (sending the browser's timezone), **logging in, logging out.**
10. **Projects: the list, and creating one.**

**Done looks like:** a person opens `http://localhost:5173`, registers or logs in, sees their
projects, creates one, reloads the page and is still logged in, logs out, and is back at the login
screen. A wrong password says so in the screen's own words.

---

## Known traps

All run on 2026-10-24, except those marked.

- **`fetch` does not fail on a refusal.** A 401 came back as a normal response with `ok: false`;
  nothing was thrown. Every call must check `ok`, which is why one client function does it once.
- **A 204 has no body to read.** `await response.json()` on a 204 threw
  `SyntaxError: … Unexpected end of JSON input`. Nineteen endpoints answer 204.
- **`new Date()` moves a due date to the day before, anywhere west of UTC.** `"2026-09-25"` became
  **Thu Sep 24**, 17:00, in Vancouver: JavaScript reads a bare date as midnight UTC. This is design
  section 8's `pg` lesson again, in the browser. A due date is shown as the text it is, and compared
  as text: `"2026-10-24" < "2026-10-25"` is true. The same goes for ids, the other way:
  `"10" < "9"` is also true. So the client never sorts or compares ids; order comes from the server.
- **"Today" is the account's, not the browser's clock.** The same moment, 23:30 UTC on 24 October,
  is `2026-10-24` in Vancouver and `2026-10-25` in Zagreb. `Intl.DateTimeFormat("en-CA", { timeZone })`
  with the account's `timezone` gives the label. Overdue, and the subtask rule's "not before today",
  are both questions about today.
- **The browser reports its timezone the way the server wants it.**
  `Intl.DateTimeFormat().resolvedOptions().timeZone` gave `America/Vancouver`, and registering with
  it was 201.
- **`StrictMode` runs every effect twice in development.** One screen opening created two projects.
  A write never goes in an effect.
- **There are two `RouterProvider`s.** Run: `react-router` and `react-router/dom` both export one,
  and they are not the same function. Version 8's changelog says a browser app imports it from
  `react-router/dom`, and everything else from `react-router`.
- **Scripts cannot see the session.** `document.cookie` was empty and `Set-Cookie` read as `null`, by
  design. "Am I logged in?" is `GET /api/account`, never a look at cookies.
- **`localhost` and `127.0.0.1` are different hosts to a cookie.** A cookie set while on one is not
  sent to the other. Open the app at the address Vite prints, every time. *Reasoned.*
- **A `Secure` cookie on plain `http://localhost` is allowed** — kept, and sent, in the browser this
  was run in. Chrome and Firefox document the same exception for `localhost`. *Reasoned for browsers
  other than the one run.*
- **`SameSite=Strict` and arriving from a link.** Following a link to Taskco from an email or another
  site loads the page without the cookie. The frontend's own `fetch` calls, made from Taskco's page,
  then carry it. A single-page app loses nothing by this; a server deciding "logged in" from the
  first page load would. *Reasoned.*
- **The root test run collects everything.** Run: a test outside `src` was collected, given the
  database setup, and failed for want of `document`. Piece 1.
- **The app mounted under `/api` leaves an outer app with Express's own 404 page.** Run: `/account`
  and `/elsewhere`, outside the mount, came back as Express's HTML page — the trap step 5's
  preparation named, one level up. In development nothing goes there but a mistyped `curl`. Once
  hosted, that outer app is what serves the built frontend, and it needs an answer of its own for
  paths it does not know.

---

## Open items step 7 meets

| Item | What step 7 does to it |
|---|---|
| `frontend-origin-not-decided` | Question 2 |
| `bodyless-posts-trust-samesite-alone` | Question 3 |
| `secure-cookie-needs-a-secure-origin` | Answered for development by the run above, through the proxy. Stays open for hosting |
| `refusal-reasons-are-developer-sentences` | Question 8 |
| `project-type-drift` | Its wire half: question 7 |
| `delete-mode-answers-three-ways`, `lead-cannot-read-tasks-in-delete-mode` | Question 9 |
| `node-24-not-declared` | Closed by piece 5 of 7a |
| `no-timezone-change` | New: no function changes an account's timezone, which section 8 says is changeable in settings. A settings screen meets it |
| `due-date-confirmation-not-built`, `not-before-today-not-built`, `no-renaming` | Slice 7b |
| `no-subtask-moves` | Slice 7c |
| `no-former-members-list` | Slice 7e |
| `streaks-are-one-query-per-routine`, `routines-cannot-be-edited-or-deleted`, `undo-answers-409-for-an-unknown-routine` | Slice 7f |
| `account-deletion-list-not-built` | Slice 7g |
| `preview-queries-per-task` | Closed when `src/preview.ts` is deleted, once 7b shows tasks |
| `transfer-notifies-nobody`, `delete-mode-notifies-nobody` | Still waiting: step 7 is where a popup would appear, but nothing yet records what to show |
