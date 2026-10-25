# Slice 7a — registering, logging in, projects

Specified 2026-10-24, from the ten decisions in [`design-decisions.md`](./design-decisions.md)
section 16 and the preparation in [`step-7-prep.md`](./step-7-prep.md). The first slice of step 7,
in [`learning-path.md`](./learning-path.md). Nothing here is built. It starts on Stjepan's go-ahead,
on a new branch, `step-7a`, from `main`.

**The toolchain below was run together on 2026-10-24**, in a throwaway folder, with exactly the
pinned versions:

- a component, its SASS module and its test;
- a route whose loader fetches;
- a form submitted through an action;
- a type check and a production build.

The traps it found are at the end.

---

## What it must do

A person can register, log in, stay logged in across a reload, see their projects, create one, and
log out. Everything goes through the real API, from a page served by Vite.

To get there, four backend changes come first:

- the API moves under `/api`;
- writes from another origin are refused;
- every error answer carries a code;
- the root test run stops collecting files outside `src`.

No migration.

## Done looks like

- `npm run dev` at the root and `npm run dev` in `web/`; then `http://localhost:5173`.
- **Logged out**, any page goes to `/login`.
- **Registering** creates an account with the browser's own timezone, and lands on the projects page:
  "No projects yet".
- **Logging in** as `lead@example.com`, password `taskco-demo` (the seed), shows "Website
  relaunch".
- **A wrong password** says "The email or password is wrong." — the frontend's own words, chosen by
  the code — and the form keeps the email.
- **Registering a taken address** says so in the frontend's words. **A password under eight
  characters** is refused in the browser, before anything is sent.
- **Creating a project** adds it to the list. **A blank name** is refused in the browser. **A name
  already on the dashboard** shows "You already have a project called …" while it is typed, and
  creating it anyway works.
- **Reloading** keeps you logged in. **Logging out** returns you to `/login`, and the back button does
  not bring the projects back.
- **A session ended elsewhere** — logged out in another tab — sends the next navigation to `/login`.
- **A write sent with `Sec-Fetch-Site: cross-site` or `same-site`** is 403, and changes nothing.
- Both test suites pass, and both type checks are clean.

## Concepts involved

- A component: a function from what it is given — its props — to what is shown, written in JSX.
- State, and why changing it shows the component again.
- A route: the address chooses what is shown; a layout route wraps others.
- Loaders and actions: data arrives before a screen shows, and a form posts to an action.
- CSS modules and SASS: class names that belong to one file, with nesting and variables.
- Testing a component the way a person uses it — finding things by role, label and text, typing and
  clicking — with a stand-in for `fetch`.
- Origins and proxies, and why a browser withholds another origin's answer.
- A code for the program and words for the person.

## Firsts, for Stjepan to type

Seven kinds of thing are new in this slice, met in six pieces. Each is specified with `path:line`
when it is reached, explained one concept at a time, and typed by Stjepan — test first. The suite
and the type check run before each is committed. Every other piece is Claude's, test-first, one
commit per idea.

| Piece | Kinds met | What |
|---|---|---|
| F1 | a component test; a component | `ProjectList`: shows each project's name, in the order given, or "No projects yet" |
| F2 | a SASS module | `ProjectList.module.scss` |
| F3 | a route | the router, and `/login` showing the login form |
| F4 | an action | the login form submits: the API is asked, success goes to `/`, a refusal is shown |
| F5 | a loader | `/` loads the projects before it shows, through `ProjectList` |
| F6 | a component that keeps state | `NewProject`: a "New project" button that opens a name field, with Cancel. It refuses a blank name, and hints at a name already on the dashboard without refusing it |

Section 16 named six kinds for 7a. An action is the seventh: Data mode brings it, and it is not a
loader.

---

## The pieces, in order

**C** is Claude's, **F** is Stjepan's. Each ends in a test seen failing first, or a check that can
fail.

### The backend

**C1 — the root collects only its own tests.** `include: ["src/**/*.test.ts"]` in
`vitest.config.ts`. Check: `npx vitest list` still lists four hundred and three tests, and a test
placed outside `src` is not collected.

**C2 — the API under `/api`.** `server.ts` builds an outer app and mounts `app` at `/api`. The tests
import `app` directly, so not one changes. Check: `curl http://127.0.0.1:3000/api/account` is 401.
The `curl` lines in `reference.md` gain `/api`.

**C3 — writes from another origin are refused.** It is the first thing in `app.ts`, above
`express.json()` and the two public routes. A request with any method but `GET`, `HEAD` and
`OPTIONS`, carrying a `Sec-Fetch-Site` other than `same-origin`, is answered 403. Tests:

- `cross-site` and `same-site` are refused, and nothing is created;
- `same-origin` goes through;
- `POST /sessions` is refused from another site too;
- a `GET` from another site is not refused.

Closes `bodyless-posts-trust-samesite-alone`.

**C4 — every refusal carries a code.** A refactor of `queries.ts`: `Refused` takes a code beside
its message, as below. Every query test stays green: they match `{ message }`, which does not change.

**C5 — every error answer carries the code.** `handleErrors` sends `{ error, code }`, and every
fixed answer in `app.ts` gains its own code. The thirty-eight HTTP tests that compare a whole error
body gain `code`. They are seen red first, then green. Closes
`refusal-reasons-are-developer-sentences`.

A code names a reason, not a line of code: one reason refused in four places has one code. Proposed
— for review before C4:

| Code | Status | Answered when |
|---|---|---|
| `invalid-body` | 400 | Zod refused the body; `issues` still come with it |
| `invalid-json` | 400 | the body is not JSON |
| `unreadable-request` | 400, 415 | a character set, encoding or path escape that cannot be read |
| `body-too-large` | 413 | over 100 kB |
| `wrong-email-or-password` | 401 | any failed login |
| `not-logged-in` | 401 | no live session |
| `other-origin` | 403 | C3 |
| `lead-only` | 403 | an Associate asking for the Lead's action |
| `not-found` | 404 | every `NotFound`, and every path that names nothing |
| `email-taken` | 409 | `registerUser` |
| `unknown-timezone` | 409 | `registerUser` |
| `account-being-deleted` | 409 | `deleteAccount` twice |
| `account-not-reopenable` | 409 | `reopenAccount` outside its window |
| `project-being-deleted` | 409 | `addMember`, `deleteProject`, `deleteProjectNow`, and every writer through `refuseIfProjectIsBeingDeleted` |
| `project-not-restorable` | 409 | `restoreProject` |
| `new-lead-not-a-member` | 409 | `transferLeadership` |
| `new-lead-being-deleted` | 409 | `transferLeadership` |
| `already-lead` | 409 | `transferLeadership` |
| `cannot-remove-lead` | 409 | `endMembership` |
| `own-neighbour` | 409 | `moveTask` |
| `neighbour-not-found` | 409 | `moveTask` |
| `no-neighbour` | 409 | `moveTask` |
| `neighbour-in-another-project` | 409 | `moveTask` |
| `subtask-limit` | 409 | `createSubtask` |
| `subtask-due-after-task` | 409 | `refuseDueDateAfterParent` |
| `assignee-not-a-member` | 409 | `refuseUnlessCurrentMember` |
| `no-account` | 409 | `createInvite`: "No email found" |
| `already-a-member` | 409 | `createInvite` and `acceptInvite` |
| `invite-expired` | 409 | `acceptInvite` |
| `not-completed-today` | 409 | `undoCompletion` |
| `server-error` | 500 | anything else |

### The frontend's ground

**C6 — `web/`.** Installed with `--save-exact`, at the versions in the preparation's table: React
19.3.0, React Router 8.4.0, Vite 8.3.2, Vitest 5.0.3, and the rest.

- `engines` in `web/package.json` and in the root's: Node 24.7 or later. That closes
  `node-24-not-declared`.
- `tsconfig.json`: DOM types, JSX, bundler resolution, `vite/client` types for SASS modules.
- `vite.config.ts`: the React plugin, the proxy `/api` → `http://127.0.0.1:3000`, and Vitest in
  `jsdom` with a setup file that cleans up after every test.
- `index.html`, and `src/main.tsx` showing "Taskco".
- Scripts: `dev`, `test`, `typecheck`, `build`.

Check: the page shows at `http://localhost:5173`, and `npm run typecheck` is clean.

**F1 — first component, first component test.** `web/src/projects/ProjectList.tsx` and its test.
Given two projects it shows both names, in that order. Given none, it says "No projects yet". The
test is written first, and fails because the component does not exist. `main.tsx` then shows it with
two made-up projects, to see it in the browser.

**F2 — first SASS module.** `ProjectList.module.scss`: the list's spacing, with a SASS variable and
nesting. Check: in the browser, and the class name on the list is not the one written in the file.

**C7 — the wire types and the API client.**

- `web/src/api/types.ts`: `User`, `Project` with the asker's `role`, and the error body. Ids and
  timestamps are strings; a due date is a named alias of `string`.
- `web/src/api/client.ts`: one function every screen calls. It adds `/api`, sends and reads JSON,
  checks `ok`, and reads no body from a 204. A refusal is thrown as an `ApiError` carrying the status,
  the code and the server's sentence. A server that cannot be reached is an `ApiError` with status 0,
  `unreachable`.

Its tests use a stand-in `fetch`, one for each kind of answer.

### Logging in

**F3 — first route.** `web/src/routes.tsx` holds the route list; `main.tsx` builds the router from
it, with `RouterProvider` from `react-router/dom`. `/login` shows the login form: email and password,
and "Log in". Its test renders `/login` in a memory router and finds both fields by their labels.
Check: `http://localhost:5173/login`.

**F4 — first action.** Submitting the form posts to `/login`'s action, which asks
`POST /api/sessions` through the client.

- Success redirects to `/`.
- `wrong-email-or-password` is returned to the form and shown in the frontend's words, keeping the
  email.

The tests use a stand-in `fetch`: a 401 shows the words, and a 201 leaves `/login`. Check: log in
as the seed's Lead. `/` has no route yet, so it lands on React Router's own "not found" page — until
F5.

**F5 — first loader.** `/` loads `GET /api/projects` before it shows, and shows the list through
`ProjectList`. Its test uses a stand-in `fetch`, and expects the names to appear. Check: logged in as
the Lead, "Website relaunch".

**C8 — who is logged in.**

- A layout route around `/`: its loader asks `GET /api/account`, and a 401 redirects to `/login`.
  Its page shows the email and a "Log out" button.
- `/logout`'s action ends the session and redirects to `/login`.
- `/login`'s loader sends someone already logged in to `/`.
- An error boundary at the root turns any 401 into `/login`, and anything else into one plain
  sentence.

Tests for each. Check: reload, log out, the back button, and logging out in a second tab.

### Projects, and registering

**C9 — `/`'s action creates a project** through `POST /api/projects`, and returns a refusal to the
form. Tests.

**F6 — first component that keeps state.** `NewProject` is a "New project" button. It opens a name
field and "Create", with "Cancel" closing it again. It is given the names already in the dashboard's
list.

- **A blank name** is refused before anything is sent, with "Give the project a name".
- **A name already in the list** shows a hint while it is typed: "You already have a project called
  Garden." It ignores case and surrounding spaces, so "garden " matches. It does not refuse: Create
  still works, and two projects may share a name (design section 3).

It posts to C9's action. Tests:

- opening and closing;
- the blank-name refusal;
- the hint appearing for a name in the list, in any case, and not for a new one;
- that a name in the list is still sent when Create is pressed.

Check: create a project, see it in the list, then start typing its name again and see the hint.

**C10 — registering**, a copy of F3 and F4. `/register` takes an email, a password and nothing else.
The timezone is the browser's own, from `Intl.DateTimeFormat().resolvedOptions().timeZone`. In the
browser: the address must look like one, and the password must be 8 to 128 characters, both in the
frontend's words. `email-taken` and `unknown-timezone` come back from the server in its words.
Success lands on `/`. `/login` and `/register` link to each other. Tests.

**C11 — the other SASS modules**, copies of F2: the login and register forms, the layout, and
`NewProject`.

**C12 — the docs.**

- `reference.md` gains a section for `web/` and for the backend changes.
- `open-items.md` closes what this slice closed.
- Design section 16 says what is built.
- The progress log gets 7a's entry.

Then Stjepan goes over the commits, and 7a gets its review.

### The words the frontend shows

Proposed, and his to change:

| Code | Words |
|---|---|
| `wrong-email-or-password` | The email or password is wrong. |
| `email-taken` | An account already uses that email. Log in instead? |
| `unknown-timezone` | Your browser's timezone isn't one Taskco knows. |
| `unreachable` | Taskco can't be reached. Is the server running? |
| any other | Something went wrong. Try again. |

## Pace

An estimate as a stuck-detector, not a deadline: **10 to 15 hours**, most of it in the six firsts.
If F3 or F4 passes three hours, that is the moment to ask, not to grind.

---

## Traps

The preparation's thirteen still apply — above all `fetch` not failing on a refusal, the 204 with
no body, `new Date()` on a due date, `StrictMode`'s second run of every effect, and the two
`RouterProvider`s. Four more, met while specifying this slice:

- **Component tests do not clean up after themselves under Vitest.** Run: two tests each showing
  "Website" — the second found both copies, `Found multiple elements with the text: Website`. The
  first test's screen was still there. Testing Library cleans up by itself only where test functions
  are global, and here they are imported. C6's setup file calls `cleanup()` after every test. With
  it, all four tests passed.
- **npm now withholds install scripts.** Installing `sass-embedded` drew
  `npm warn allow-scripts @parcel/watcher … (install: node scripts/build-from-source.js)`. It was not
  approved, and the build compiled SASS anyway. Leave it unapproved: a script that builds from source
  is code run on this machine at install time.
- **Thirty-eight HTTP tests compare a whole error body**, with `toEqual({ error: … })`. Adding
  `code` changes every one, which is why C5 is its own commit, after C4's refactor.
- **The login form's own 401 is not "log in first".** A failed login is 401 too. The rule that sends
  a 401 to `/login` belongs to loaders and to the root's error boundary, never to `/login`'s action,
  which must catch its 401 and show the words. *Reasoned*; F4's test holds it.
