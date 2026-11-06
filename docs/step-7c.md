# Slice 7c — a task's subtasks

Specified 2026-11-05, from slice 7c's row in [`step-7-prep.md`](./step-7-prep.md), design
sections 7, 8 and 16, and two decisions Stjepan made the same day. The third slice of step 7, in
[`learning-path.md`](./learning-path.md). Nothing here is built. It is built on branch `step-7c`,
from `main` after 7b's merge.

**The new pieces were tried on 2026-11-05**, in a throwaway test through a memory router:

- a date input with a lowest and a highest day, with and without the browser's own checks;
- an action that answers "are you sure?" before it acts, and acts when asked again;
- today as a calendar day in a given timezone.

The traps it found are at the end.

---

## What it must do

A person opens a task and sees its subtasks. The Lead creates them, each due between today and the
task's own due date. Anyone opens a subtask and changes what their role allows, as for tasks. The
Lead renames a subtask, and deletes a task or a subtask after confirming. Moving a task's due date
earlier, when that would clear its subtasks' dates, asks first and says how many.

Three backend changes first. No migration.

## Done looks like

- **A task's page lists its subtasks** under its fields, in the order the server sends, each field in
  words; "No subtasks yet" when there are none.
- **As the Lead, "New subtask"** creates one, with a title and, if wanted, a due date. The date box
  offers only days from today to the task's due date; a date outside them is refused by the server,
  in Taskco's words. A fifty-first subtask is refused.
- **A subtask's title opens it**, at `/projects/7/tasks/3/subtasks/9`, under the task. Its status,
  priority, due date, assignee and notes change as a task's do, and the Lead can rename it.
- **Moving a task's due date earlier asks first**, when it would clear subtask dates: "Moving the
  date to 2026-11-18 clears the due dates of 2 subtasks." **Save anyway** saves it; **Cancel** puts
  the date back. When nothing would be cleared, it saves at once.
- **The Lead deletes a task or a subtask** after confirming. A task's subtasks go with it.
- **As the Associate**, a subtask's status and notes can be changed; nothing else, and no New
  subtask, no renaming, no deleting.
- Both test suites pass, and both type checks are clean.

## Decided 2026-11-05, by Stjepan

Each as recommended.

- **Reordering subtasks waits for 7d**, with dragging, which tasks get there too.
  `no-subtask-moves` moves to 7d.
- **Deleting comes now**, for the Lead, after a confirm. A deleted task or subtask is hidden, not
  erased — design section 7's soft deletion — so a trash to restore from can come later.

Already decided, and built here: the warning before a task's date clears subtask dates
(`due-date-confirmation-not-built`) and "not before today" (`not-before-today-not-built`), both moved
to 7c on 2026-11-05; and renaming, which reaches subtasks (`no-renaming`).

## Concepts involved

- A loader on a nested route, and a third level of nesting.
- An action that answers "are you sure?" before it acts.
- A date input's lowest and highest day, and why the browser's own check is turned off.
- Today as the account's calendar day, not the browser's.

## Firsts, for Stjepan to type

One new kind of thing. As before: described with `path:line` when it is reached, explained one idea
at a time, and typed by Stjepan, test first. Everything else is Claude's.

| Piece | Kind met | What |
|---|---|---|
| F1 | an action that asks before it acts | the warning before a task's earlier due date clears subtask dates |

---

## The pieces, in order

**C** is Claude's, **F** is Stjepan's. Each ends in a test seen failing first.

### The backend

**C1 — rename a subtask.** `renameSubtask({ subtaskId, title })`, through `visible_subtasks` and
`visible_tasks`, like every other change to a subtask. `PUT /subtasks/:subtaskId/title`, for the
Lead: `{ title }`, trimmed, not blank. 204. It closes `no-renaming`.

**C2 — not before today.** `createSubtask` and `setSubtaskDueDate` take the asker's id and refuse a
date before the asker's today, read from `user_today`, with a new refusal, `subtask-due-before-today`
(409). Checked when the date is set, not continuously, so a subtask going overdue stays savable —
design section 7. It closes `not-before-today-not-built`.

**C3 — the count, first.** `countSubtaskDatesCleared({ taskId, dueDate })`: how many of the task's
subtask dates a new due date would clear, writing nothing. `GET /tasks/:taskId/due-date-clears?dueDate=…`,
for the Lead: 200 `{ clears }`. With F1 it closes `due-date-confirmation-not-built`.

### Seeing subtasks

**C4 — the types and the words.** `Subtask` in `types.ts`, as `GET /tasks/:taskId/subtasks` sends it;
words for `subtask-due-after-task`, `subtask-due-before-today` and `subtask-limit`. The layout route
gets the id `"account"`, so a page can read the account's timezone.

**C5 — a task's subtasks.** The task route gains a loader, `GET /tasks/:taskId/subtasks`. The task
page shows them as a table under its fields, in the order sent, each field in words, each title a
link. Tests.

**C6 — New subtask, for the Lead.** A copy of New task, sent to the task route's action with
`intent` set to `new-subtask`. The date box offers today to the task's due date. Tests, with each
refusal.

**C7 — a subtask's page.** `/projects/:projectId/tasks/:taskId/subtasks/:subtaskId`, nested in the
task page through an `Outlet`, reading the task route's data. Its fields are copies of the task's,
keyed by the subtask, with renaming; `updateSubtaskAction` names the endpoint by the field. "There's
no subtask here." for an id not in the list. Tests.

### Asking first

**F1 — first action that asks before it acts.** Saving a task's due date earlier: the task route's
action first asks C3's count. If it would clear any, the action returns `{ confirm: n }` instead of
saving, and the date field shows the warning, with **Save anyway** — the same form, sent again with
`confirmed` — and **Cancel**, which puts the date back. When nothing would be cleared, it saves as
now. Tests:

- an earlier date that clears two asks, and saves nothing;
- Save anyway saves it;
- Cancel puts the date back and saves nothing;
- a date that clears none saves at once.

### And the rest

**C8 — deleting, for the Lead.** "Delete task" on the task page and "Delete subtask" on a subtask's
page, each asking first — "Delete Dig the beds? Its subtasks go with it." — then
`DELETE /tasks/:taskId` or `/subtasks/:subtaskId`, and back to the page above. Tests.

**C9 — the SASS modules**, copies of 7b's, for the subtask table, New subtask and the subtask page.

**C10 — the docs**, as for 7b.

Then Stjepan goes over the commits, and 7c gets its review.

## Pace

An estimate as a stuck-detector, not a deadline: **6 to 10 hours**, most of it in C2, F1 and C7.

---

## Traps

7a's and 7b's still apply — above all keying a page's fields by what they show, and a choice that
shows what the server has. Four more:

- **A date box with a lowest day refuses in the browser's words.** Run: with `min` 2026-11-05,
  typing 2026-11-01 sent nothing at all — the browser's own check stopped it. With `noValidate` on
  the form, it was sent, and the server answers in Taskco's words. The date boxes keep `min` and
  `max`, so the picker offers only the days allowed, and their forms have `noValidate`.
- **Today is the account's, not the browser's.** Run: 23:30 UTC on 24 October is `2026-10-24` in
  Vancouver and in `Etc/GMT+8`, and `2026-10-25` in Zagreb.
  `new Intl.DateTimeFormat("en-CA", { timeZone })` gives the calendar day, from the account's
  `timezone`.
- **An action can ask, and act the second time.** Run: an action answered `{ confirm: 2 }` to a date,
  and the same fetcher form, sent again with `confirmed`, saved it. The question lives in the
  fetcher's data until the next answer.
- **Cancel must put the date back.** *Reasoned:* the date box is drawn from `defaultValue`, so it keeps
  what was typed; Cancel has to draw it afresh.
