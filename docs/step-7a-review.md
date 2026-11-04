# Slice 7a — review

Written 2026-11-03, after slice 7a — registering, logging in, projects — was built on branch
`step-7a` between 2026-10-24 and 2026-11-03, as specified in [`step-7a.md`](./step-7a.md). Four
changes to the server, and `web/`: the first thing that shows a person any of the backend.
Twenty-two commits; Stjepan typed the six firsts and set up `web/`, and Claude wrote the rest.

Companion to [`design-decisions.md`](./design-decisions.md) section 16, [`step-7-prep.md`](./step-7-prep.md),
and the earlier reviews, the last being [`step-5-review.md`](./step-5-review.md).

Reads like the others: each piece gets **Protects**, **Doesn't protect** and **Assumes**. A screen
adds a question of its own: **what a person sees, and can do next.** A page can send the right thing
and still leave someone looking at a blank screen or a wrong sentence.

**This file does not track status.** Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**Every behaviour claimed here was run** before it was written down, except where marked as
reasoned: in the browser pane against the dev server, with `curl`, or in a throwaway test through
the real routes that was deleted afterwards. Nothing came from a failing test. All 409 of the
server's tests and all 47 of `web/`'s pass, in file order and shuffled (seed 703), and both type
checks and the build are clean.

---

## Everything this review raised

| # | Name | What | Where |
|---|---|---|---|
| 1 | `clock-timezone-follows-a-wrong-clock` | On this machine the browser's own clock is an hour behind Windows' — 20:45 against 21:45 — so the timezone worked out from it is `Etc/GMT+8`, where the right one, `America/Vancouver`, is UTC−7 now. The account registered while checking the slice has it | `RegisterPage.tsx` |
| 2 | `unknown-page-says-something-went-wrong` | An address that names no page, `/nonsense`, says "Something went wrong. Try again." Nothing went wrong, and trying again cannot help | `RootError.tsx`, `routes.tsx` |
| 3 | `logout-page-is-blank` | Typing `/logout` into the address bar shows an empty page: the route has an action and nothing to show | `routes.tsx` |
| 4 | `new-project-loses-focus` | Pressing New project, and pressing Cancel, both drop the keyboard's focus to the page itself, so someone using the keyboard starts again from the top | `NewProject.tsx` |

**Item 1 needs a decision from Stjepan** before merging: it stores a wrong timezone, and nothing can
change it yet. Items 2, 3 and 4 are small, each a change with a test that can be watched failing
first. See the end.

One item opened while the slice was built is still open: `new-project-refusal-outlives-typing`.
Four claims in the docs were wrong because of item 1, and are corrected in the same commit as this
file — section 6.

### Deliberately allowed

- **A name the server refuses is lost.** The form closes once a name is sent, so a refusal shows
  under New project and the name must be typed again. Stjepan's choice, 2026-11-02, design section 16.
- **A write labelled `Sec-Fetch-Site: none` is refused too.** The step 5 review suggested letting it
  through; no write in Taskco starts from the address bar, and design section 16 says "other than
  `same-origin`". Run: refused, 403.
- **A browser too old to send `Sec-Fetch-Site` has `SameSite` alone.** Accepted in design section 16.
- **The login form keeps the browser's own checks**, in the browser's words, while the register form
  turns them off for Taskco's. Login has no rule to explain: any wrong answer is the same sentence.

---

## 1. The server's changes — `/api`, the origin check, the codes

**Protects.**

- **Everything is under `/api`.** Run: `GET /api/account` is 401, `not-logged-in`; `GET /account` is
  404, `not-found`, in JSON.
- **A write from another page on the same site is refused before anything else runs.** Run with
  `curl`, logged in as `register-check@example.com`: `POST /api/projects` labelled `cross-site` and
  `same-site` both answered 403, `other-origin`, and the list was the same afterwards. A `GET`
  labelled `cross-site` was answered.
- **Every error answer carries a code.** No `json({ error … })` in `app.ts` or `server.ts` lacks one.

**Doesn't protect.** Nothing found.

**Assumes** the browser sends `Sec-Fetch-Site` — every current one does — and that Vite's proxy
passes it on unchanged, which it does: Taskco's own pages are let through.

---

## 2. Asking the API — `client.ts`, `words.ts`

**Protects.** A refusal arrives as its code, and nothing reads the server's sentence. Run: with
Vite's proxy pointed at a port where nothing listens, `/api/account` answered **502 with an empty
body**, which `client.ts` turns into `unreachable` — "Taskco can't be reached. Is the server
running?" The claim in its commit had been tested only with a stand-in.

**Doesn't protect.** Nothing found.

**Assumes** the API never answers 502, 503 or 504 itself. It does not.

---

## 3. Who is logged in — `RootError`, `AccountLayout`, `/logout`

**Protects.** Run in the browser: logged out, `/` goes to `/login`; logging out goes to `/login`,
and the back button does not bring the projects back; logging out in a second tab sends the first
tab's next navigation to `/login`.

**Doesn't protect**

- **An address that names no page.** *(item 2)* Run: `/nonsense` shows "Something went wrong. Try
  again." React Router answers an unknown path with a 404 of its own, which is not an `ApiError`, so
  `RootError` treats it as a failure. A sentence of its own — "There's no page here" — and a link to
  `/` would say what happened.
- **`/logout` typed into the address bar.** *(item 3)* Run: an empty page. The route has an action,
  for the Log out button, and nothing to show for a visit. A loader that sends a visit on to `/`
  would do; logging out stays a button, since a visit must not change anything.

**Assumes** every 401 means the session is over. It does, apart from the login form's own, which
`loginAction` catches.

---

## 4. Projects — `NewProject`, `createProject.ts`

**Protects.** Run in the browser: a blank name is refused with no message sent; "garden " shows the
hint for Garden, and Create still makes a second one; the form closes once a name is sent, and the
new project shows in the list. Opening and closing again forgets the name and the refusal. Run: a
double click on Create sends one message, since the form is gone after the first click.

**Doesn't protect**

- **Where the keyboard is.** *(item 4)* Run: after New project, and after Cancel, the focused element
  is the page's `<body>`. The button pressed is taken off the page, and nothing is focused in its
  place. Focusing the Name field when the form opens, and New project when it closes, would keep
  someone using the keyboard where they were.

  *Reasoned, not run with a screen reader:* the hint is a `role="status"` element added with its
  words already in it. Some screen readers announce a status only when its words change after it is
  on the page, so the hint may never be read out. An empty status that is always there, and gets
  the words, is the dependable shape.
- **The refusal that outlives the typing** is already `new-project-refusal-outlives-typing`.

**Assumes** the list it compares names with is the one on screen. It is: `ProjectsPage` passes the
loader's names, and they are reloaded after every create.

---

## 5. Registering — `RegisterPage.tsx`

**Protects.** Run in the browser: a short password is refused with nothing sent; a taken address
gets "An account already uses that email. Log in instead?"; a new one lands on "No projects yet",
logged in.

**Doesn't protect**

- **The timezone, on this machine.** *(item 1)* Windows here is set to British Columbia Standard
  Time, and shows 21:45. Node and the browser, whose timezone data does not know the zone, both say
  20:45: `getTimezoneOffset()` is 480, eight hours behind UTC, where Windows is seven. So the clock is
  wrong before Taskco reads it, and the fallback sends `Etc/GMT+8`. Run against `taskco_dev`: Postgres
  knows `America/Vancouver`, and gives it −07:00 now. The account registered while checking the slice
  has `Etc/GMT+8`, so its "today" starts at 1am, an hour late. Design section 16 said the fallback
  was "right when the account is made"; on the one machine where it has run, it was not.

  Nothing in the browser can see the right offset, so no change to the arithmetic fixes it. Two
  things would:
  - **Ask, when the browser names no zone:** a list to choose from, with the clock's guess chosen
    already. The option set aside on 2026-11-03.
  - **Let the timezone be changed afterwards** — `no-timezone-change`. Needed anyway; until it
    exists, a wrong guess stays.

**Assumes** that when the browser names a zone, its data is current. On a machine whose browser is
older than its zone's last change, the name is right and the offset Postgres uses is too: Postgres
reads its own timezone data, not the browser's.

---

## 6. What the docs said

Four claims rested on the fallback being right today, and are corrected in this commit:

- design section 16, "A browser that names no timezone";
- `reference.md`, under `register/RegisterPage.tsx`;
- `open-items.md`, `no-timezone-change`;
- the learning path's 7a entry, which is unchanged but now points here.

The comment above `browserTimezone()` makes the same claim. It is code, so it changes with item 1.

---

## Worth doing before merging

**Item 1 — Stjepan's decision.** Ask when the browser names no zone, or merge as it is and leave it
to `no-timezone-change`. Either way, the account registered while checking can be corrected by hand
in `taskco_dev`, or reseeded away.

**Items 2 and 3 — one route each.** A 404 of React Router's own gets its own sentence and a link to
`/`; `/logout` gets a loader that sends a visit on. Each with a test through the real routes.

**Item 4 — two focus calls in `NewProject`**, and the hint's status element kept on the page. A first
of Stjepan's, so his to type, or his to hand over.
