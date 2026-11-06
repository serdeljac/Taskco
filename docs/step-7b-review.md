# Slice 7b — review

Written 2026-11-05, after slice 7b — a project's tasks — was built on branch `step-7b` the same day,
as specified in [`step-7b.md`](./step-7b.md), and after Stjepan went over the commits. Renaming on
the server, a project's page, a task's page, and each of a task's fields changed in place.
Stjepan typed the two firsts, F1 and F2; Claude wrote the rest.

Reads like [`step-7a-review.md`](./step-7a-review.md): each piece gets **Protects**, **Doesn't
protect** and **Assumes**, and the screen's own question — **what a person sees, and can do next**.

**This file does not track status.** Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**Every behaviour claimed here was run**, in a throwaway test through the real routes and the
stand-in API that was deleted afterwards, or in the browser while 7b was built, except where marked
as reasoned. All 426 of the server's tests and all 89 of `web/`'s pass, in file order and shuffled
(seed 1105), and both type checks and the build are clean.

---

## Everything this review raised

| # | Name | What | Where |
|---|---|---|---|
| 1 | `refused-choice-stays-shown` | When the server refuses a change, the field keeps showing the value that was refused. Run: status set to Completed and refused — the select said Completed, the list said In progress | `TaskPage.tsx` |
| 2 | `refusal-follows-to-another-task` | A refusal on one task still shows after another task is opened. Run: refused on Dig the beds, still there on Buy seeds | `TaskPage.tsx` |
| 3 | `deleting-project-opens-as-empty` | A project being deleted opens for its Lead as if it had no tasks, with New task and Rename, which the API refuses — in "Something went wrong. Try again." | `ProjectPage.tsx` |

**Items 1 and 2 are worth fixing before merging**; both are in `TaskPage.tsx`, and item 1 is in
Stjepan's F2 as well as Claude's copies. Item 3 waits for slice 7e, where delete mode gets its
screen. See the end.

### Deliberately allowed

- **Every change reloads four things.** Run: one status change made five requests — the `PUT`, then
  `GET` for the account, the projects, the tasks and the members. The router reloads every loader on
  the page after an action. Fine at this size. `step-7b.md`'s trap said three; corrected in this
  commit — section 5.
- **The Lead's empty due date is an empty date box**, which the browser draws as `mm/dd/yyyy`; the
  list says "TBD".
- **Moving a task's date earlier clears its subtasks' later dates without asking**, until 7c.
  Stjepan's decision of 2026-11-05.
- **A task id not in the list says "There's no task here."** under the project. Design section 16.

---

## 1. Renaming, on the server

**Protects.** Each by its tests: the Lead renames a task or the project, trimmed; an Associate gets
403; a blank name is 400; a deleted task 404; a project being deleted 409, its name unchanged.

**Doesn't protect.** Nothing found.

**Assumes** the Lead never needs to rename a subtask before 7c.

---

## 2. A project's page

**Protects.** Run in the browser while building: a project's name on `/` opens it, with its tasks in
the order sent, each field in words, and its members; an unknown project says "There's no page
here."; the Lead creates a task, which ends the list, and a blank title is refused in the browser.

**Doesn't protect**

- **A project being deleted.** *(item 3)* Run: its Lead opens it, sees "No tasks yet", New task and
  Rename, and creating a task answers "Something went wrong. Try again." `GET /projects` gives the
  Lead a project being deleted, with its date, but `listTasks` hides its tasks —
  `lead-cannot-read-tasks-in-delete-mode` — and every writer refuses. Design section 16 decided the
  screen: a banner saying when, with "Undo" and "Delete now", and no tasks. That is slice 7e's. Until
  then, words of its own for `project-being-deleted` — "This project is being deleted." — would at
  least say why.

**Assumes** the projects list carries what the page needs about the project. It does: name, role,
and its deletion date.

---

## 3. A task's page

**Protects.** Run in the browser while building, and by the tests: a task opens under the list with
no request; each field saves, a choice at once and a typed date or notes with a button; the list
then shows it; an Associate can change only the status and the notes; another task opened shows its
own values, because each form is keyed by the task's id.

**Doesn't protect**

- **A refused change.** *(item 1)* Run: status set to Completed and refused with 502 — the refusal
  showed, the list said In progress, and the select still said **Completed**. The form is keyed by
  the task, and the task did not change, so the select keeps what was chosen. *Reasoned from the
  same code:* priority, the assignee and the due date behave the same. The cure is to show what the
  server has: the field's value is the task's, and only while the change is on its way is it what
  was sent — `fetcher.formData` — so a refusal puts it back.
- **A refusal carried to another task.** *(item 2)* Run: refused on Dig the beds, and still shown
  after Buy seeds was opened. Keying a form draws the form afresh, not the fetcher: the five fetchers
  belong to `TaskPage`, which stays on the screen while only its parameter changes. Moving the
  fields into a component keyed by the task's id gives each task fetchers of its own.

**Assumes** the task's data on the page is the project's, reloaded after every change. It is, which
is what makes item 1's cure possible.

---

## 4. The tests

**Protects.** Eighty-nine in eighteen files, through the real routes. A test that passed from the
start was broken on purpose — F2's switching test, without the key.

**Doesn't protect.** No test refused a change and then looked at the field, which is how item 1
went unseen; none opened a second task after a refusal, item 2.

---

## 5. What the docs said

`step-7b.md`'s fourth trap said one change reloads three things, with the members. It is four: the
account's loader runs again too. Corrected in this commit.

---

## Worth doing before merging

**Items 1 and 2, together, in `TaskPage.tsx`.** Move the fields into a component keyed by the task's
id, so each task has its own fetchers, and give each choice the task's value, or the one being sent
while it is on its way. Each with a test that refuses a change and looks at the field, and one that
opens another task after a refusal. The status field is Stjepan's F2: his to type, or his to hand
over.

**Item 3's words** can come now — one entry in `words.ts` — and its screen with 7e.
