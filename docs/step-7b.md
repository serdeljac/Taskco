# Slice 7b — a project's tasks

Specified 2026-11-05, from slice 7b's row in [`step-7-prep.md`](./step-7-prep.md), design
sections 7 and 16, and three decisions Stjepan made the same day. The second slice of step 7, in
[`learning-path.md`](./learning-path.md). **Built** 2026-11-05 on branch `step-7b`, from `main`
after 7a's merge; not yet reviewed. Changed on the way, each for Stjepan's review:

- **F2 was split.** The task page's action came first, as Claude's — an action is a kind already
  met — so F2 was the fetcher alone, as C9 came before F6 in 7a.
- **The due date and the notes save with a button**, not on change: a date box reports every digit
  of the year as it is typed. Design section 16.
- **A task id not in the list says "There's no task here."** under the project. See C6.
- **The project page's action is `projectAction`**, renaming the project or creating a task;
  `createTask.ts` went into it in C8.

**The new React Router pieces were tried together on 2026-11-05**, in a throwaway test through a
memory router and the stand-in API:

- a route with a parameter, and a loader reading it;
- a link to a nested route;
- a form that saves in place through a fetcher, with the page's data reloaded after;
- an unknown id answered with a 404 of the loader's own.

The traps it found are at the end.

---

## What it must do

A person opens a project from their list and sees its tasks in order, and its members. The Lead
creates tasks. Anyone opens a task on its own page and changes what their role allows: an Associate
the status and the notes; the Lead those, the priority, the due date and the assignee as well. The
Lead can rename a task and the project.

Two backend changes first, for renaming. No migration.

## Done looks like

- On `/`, **a project's name opens it**, at `/projects/7`: its name, its members, and its tasks in
  the order the server sends, each with its status, priority, due date and assignee.
- **Empty fields have words**: a priority not set says "Not set", a due date not set "TBD", and a
  task for nobody "Nobody".
- **As the Lead, "New task"** creates one at the bottom of the list, with a title and, if wanted, a
  due date. A blank title is refused in the browser.
- **A task's title opens it**, at `/projects/7/tasks/3`, under the list. Changing its status saves
  at once, the list shows the new status, and a reload keeps it. The same for priority, due date —
  emptied, it is "TBD" — and assignee. Notes save with a button.
- **As the Associate**, a task's status and notes can be changed; its priority, due date and
  assignee are shown as text. There is no "New task", and no renaming.
- **As the Lead, a task and the project can be renamed.** A blank name is refused in the browser.
- **An address naming no project** — or a project the person is not a member of — says
  "There's no page here." **One naming no task** in a project that exists shows the project, with
  "There's no task here." under its list. *Changed 2026-11-05, building C6:* the task page has no
  loader of its own to throw a 404 from, since it reads the project's data.
- `src/preview.ts`, slice B's throwaway page, is gone.
- Both test suites pass, and both type checks are clean.

## Decided 2026-11-05, by Stjepan

Each as recommended; the reasons are in design section 16.

- **Renaming:** the Lead may rename a task and a project. Subtasks wait for 7c. Meets `no-renaming`.
- **Where a task is changed:** on its own page, opened from the list. Subtasks join that page in 7c.
- **The warning before a task's date clears subtask dates** — `due-date-confirmation-not-built` —
  waits for 7c, where subtasks first appear on screen. So does the subtask rule's "not before
  today", `not-before-today-not-built`. Until then a date moved earlier clears subtask dates as the
  API always has, silently.

## Concepts involved

- A route parameter: part of the address that names something, `:projectId`.
- A link, and a route nested inside another, shown through an `Outlet`.
- A child route reading its parent's data, rather than asking the server again.
- A form that saves without leaving the page: a fetcher.
- A select, a date input and a text area, and what each gives back.
- A `key` that makes React draw a form afresh.
- A page that shows different controls to the Lead and to an Associate.

## Firsts, for Stjepan to type

Three new kinds of thing, in two pieces. As in 7a: each is described with `path:line` when it is
reached, explained one idea at a time, and typed by Stjepan, test first. Everything else is
Claude's, test first, one commit per idea.

| Piece | Kinds met | What |
|---|---|---|
| F1 | a route with a parameter; a link | `ProjectPage` at `/projects/:projectId`, and `ProjectList`'s names as links to it |
| F2 | a fetcher | a task's status: a select that saves the moment it changes |

---

## The pieces, in order

**C** is Claude's, **F** is Stjepan's. Each ends in a test seen failing first.

### The backend

**C1 — rename a task.** `renameTask({ taskId, title })` in `queries.ts`, through `visible_tasks`, so
a deleted task, or one in a project being deleted, is `NotFound`. `PUT /tasks/:taskId/title`, for
the Lead: `{ title }`, trimmed, not blank. 204. Tests in `4_tasks` and `tasks`.

**C2 — rename a project.** `renameProject({ projectId, name })`, refused with
`project-being-deleted` while the project is being deleted, like every other writer.
`PUT /projects/:projectId/name`, for the Lead: `{ name }`, trimmed, not blank. 204. Tests in
`3_projects` and `projects`. With C1 it closes `no-renaming` for tasks and projects; subtasks are
7c's.

### Seeing a project

**C3 — the wire types and the words.** `Task`, `TaskStatus`, `Priority` and `Member` in
`types.ts`, as `GET /projects/:projectId/tasks` and `/members` send them — run on 2026-11-05:

```json
{ "id": "1", "project_id": "1", "title": "Draft the homepage", "status": "in_progress",
  "priority": "high", "due_date": "2026-09-25", "notes": null, "assignee_membership_id": "1",
  "position": 65536, "created_at": "…", "deleted_at": null }
```

The words a person reads for each status — "Not started", "In progress", "On hold", "Completed" —
and each priority — "Low", "Med", "High" — with "Not set", "TBD" and "Nobody" for the empty ones.
Tests.

**F1 — first route with a parameter, first link.**

- `ProjectList`'s names become links to `/projects/:id`. Its test gains one.
- `/projects/:projectId` shows `ProjectPage`. Its loader reads `params.projectId`, finds the project
  in `GET /projects` — which carries the asker's role — and asks
  `GET /projects/:projectId/tasks`. A project not in the list throws a 404 of its own, so the root's
  error page says "There's no page here."
- The page shows the project's name and its tasks' titles, in the order sent.

Tests: the titles in order, and an unknown id. Check: open "Website relaunch" from `/`.

**C4 — the project page in full.** The same loader asks for the members too, alongside the tasks.
Each task shows its status, priority, due date and assignee's email in the words of C3, and the page
lists its members, the Lead first, as the server sends them, with a link back to `/`. Tests.

**C5 — New task, for the Lead.** A copy of `NewProject`: a title, refused when blank, and an
optional due date. It posts to the project route's action, which asks
`POST /projects/:projectId/tasks`, closes once sent, and shows a refusal under its button. An
Associate does not see it. Tests.

### Changing a task

**C6 — the task page.** `/projects/:projectId/tasks/:taskId`, nested in the project's route and
shown through an `Outlet` under the list. It reads the project route's data with
`useRouteLoaderData`, so opening a task asks the server nothing. A task not in the list says
"There's no task here." under it.
Each title in the list links to it. Tests.

**F2 — first fetcher.** The task's status is a select. Choosing one saves it at once, through
`useFetcher`, to the task route's action, which asks `PUT /tasks/:taskId/status`. The page stays
where it is; afterwards the router reloads the project's data, so the list shows the new status too.
The form is keyed by the task's id — see the traps. Tests:

- choosing a status sends it;
- the list then shows it;
- opening another task shows that task's status, not the last one's.

**C7 — the other fields**, copies of F2. The action reads which field changed from the form's
`intent`.

- **Priority**, the Lead's: the three, or "Not set", sent as `null`.
- **Due date**, the Lead's: a date input. Emptied, it sends `null` and shows "TBD".
- **Assignee**, the Lead's: the members by email, or "Nobody".
- **Notes**, anyone's: a text area and a Save button. Blank is stored as empty.

An Associate sees the Lead's three as text. Tests for each field, and for the Associate's page.

**C8 — renaming, on screen.** The task's title on its page, and the project's name on the project
page: for the Lead, a text field and Save, a blank name refused in the browser. Tests.

### And the rest

**C9 — `src/preview.ts` goes**, with its `npm run preview` and the reference's lines about it. It
closes `preview-queries-per-task`.

**C10 — the SASS modules** for the project page, its task list and the task page, copies of 7a's.

**C11 — the docs.**

- The reference gains 7b's endpoints and files.
- `open-items.md` closes what 7b closed.
- Design section 16 says what is built.
- The progress log gets 7b's entry.

Then Stjepan goes over the commits, and 7b gets its review.

## Pace

An estimate as a stuck-detector, not a deadline: **8 to 12 hours**, most of it in F2 and C7. If F2
passes three hours, that is the moment to ask.

---

## Traps

7a's still apply — above all a due date read with `new Date()`, which moves it to the day before
anywhere west of UTC, and `StrictMode`'s second run of every effect. Five more:

- **A form keeps the last task's values when another task is opened.** Run: with "Dig" in progress
  and "Plant" not started, opening Dig and then Plant showed Plant as **in progress**. The task page
  stays on the screen, and only its parameter changes, so fields that start from `defaultValue` keep
  what they had. A `key` of the task's id makes React draw the form afresh; with it, Plant showed
  "not started".
- **A parameter is a string.** Run: `typeof params.projectId` was `"string"`. Ids are compared as
  the strings they are, never as numbers, and never sorted: `"10" < "9"`.
- **An unknown project is not an error from the API.** `GET /projects` answers 200 without it. The
  loader has to throw `data(null, { status: 404 })` for the root's page to say "There's no page here."
  Run: the error page showed.
- **One change reloads the whole page's data.** Run: after one status change through a fetcher, the
  project's two `GET`s ran again. *Corrected by the 7b review:* with the members and the account's
  loader, four reads for each change, after the change itself. Fine at this size.
- **A date input gives text, and empty text.** `"2026-11-20"`, or `""` once cleared. `""` is sent as
  `null`, and the text is shown as it is.
