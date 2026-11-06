# Slice 7c — review

Written 2026-11-06, after slice 7c — a task's subtasks — was built on branch `step-7c` from
2026-11-05 to 2026-11-06, as specified in [`step-7c.md`](./step-7c.md), and after Stjepan went over
the commits the same day. Three changes on the server; a task's subtasks, New subtask, a subtask's
own page, asking before a task's date clears subtask dates, and deleting. Stjepan typed the first,
F1; Claude wrote the rest.

Reads like [`step-7b-review.md`](./step-7b-review.md): each piece gets **Protects**, **Doesn't
protect** and **Assumes**, and the screen's own question — **what a person sees, and can do next**.

**This file does not track status.** Whether an item is still open is answered in
[`open-items.md`](./open-items.md), by the name in the table below.

**Every behaviour claimed here was run**, in a throwaway test through the real routes and the
stand-in API that was deleted afterwards, or in the browser while 7c was built, except where marked
as reasoned. All 446 of the server's tests and all 123 of `web/`'s pass, in file order and shuffled
(seed 1106), and both type checks and the build are clean.

---

## Everything this review raised

| # | Name | What | Where |
|---|---|---|---|
| 1 | `confirm-outlives-a-changed-date` | When moving a task's date asks first, the question stays while another date is typed, with the old count, and Save anyway saves the new date unasked. Run: asked about 2026-11-18, which clears 2; 2026-11-10 typed; Save anyway saved 2026-11-10 | `DueDateField.tsx` |
| 2 | `due-date-question-drops-focus` | After Cancel or Save anyway, the keyboard's focus falls to the page itself: the button pressed is gone. Run: focus on Save date while asking, then on `body` after either | `DueDateField.tsx` |
| 3 | `clears-words-say-1-subtasks` | "clears the due dates of 1 subtasks." Seen in the browser, moving Draft the homepage to 2026-09-21 | `DueDateField.tsx` |
| 4 | `subtask-date-box-keeps-a-cleared-date` | With a subtask open, moving its task's date earlier clears the subtask's date; the list says TBD, but the subtask's date box keeps the old date, past its own new limit. Run: list TBD, box 2026-11-25, its `max` 2026-11-18 | `DueDateField.tsx` |
| 5 | `delete-refusal-comes-back-after-cancel` | A refused delete's words hide while Delete asks again, and come back after Cancel, though nothing new was tried. Run: 502 on Delete; the words gone while asking, back after Cancel | `Delete.tsx` |
| 6 | `today-throws-for-a-zone-the-browser-lacks` | `todayIn` throws for a timezone the browser does not know, and a subtask's page, which always works out today, shows "Something went wrong. Try again." Run: Postgres accepts 598 zone names and Node's `Intl` refuses one, `Factory`; an Associate with it opening a subtask got that page | `today.ts` |

**Items 1 to 4 are worth fixing before merging**; all four are in `DueDateField.tsx`, and items 1 to
3 are in Stjepan's F1. Item 5 is one line, and can come with them. Item 6 can wait. See the end.

### Deliberately allowed

- **An overdue task takes no dated subtask.** Not after its task and not before today leave no day
  between them. Run: under a task due 2026-10-02, New subtask's date box offered 2026-11-06 to
  2026-10-02 — none — and in the browser while building C7, a date was refused either way. TBD is
  still allowed; the Lead moves the task's date first. Design section 7's two rules, together.
- **Every date asks, not only an earlier one**, at one more request per save. Design section 16.
- **`userId` is optional** in `createSubtask` and `setSubtaskDueDate`, so the seed and the tests of
  other rules need not have one. A route that forgot it would skip "not before today" silently; both
  routes pass it, and each has a 409 test that goes red without it. A sign, like
  `subtask-due-date-rule-is-a-sign`.
- **Deleting has no trash yet.** Soft deletion keeps the rows. Design section 16.
- **Subtasks stay in the order they were created** until 7d. `no-subtask-moves`.

---

## 1. Renaming a subtask, on the server

**Protects.** Each by its tests: the Lead renames a subtask, trimmed; an Associate gets 403; a blank
title is 400; a deleted subtask, or one under a deleted task, is 404.

**Doesn't protect.** Nothing found.

**Assumes** a subtask's title follows a task's rules. It does: the same Zod schema, `taskTitle`.

---

## 2. Not before today

**Protects.** Each by its tests: yesterday refused and today taken, for a new subtask and a moved
date; two users twenty-five hours apart, in Kiritimati and Pago Pago, judged each by their own day;
an overdue subtask still savable. By reading the code: a cleared date is never checked, since the
check runs only for a date.

**Doesn't protect.** A caller that passes no asker. Reasoned: see "Deliberately allowed".

**Assumes** every route that sets a subtask's date passes the asker. The two that exist do.

---

## 3. The count before a date moves

**Protects.** Each by its tests: the count for dates that clear one, two and none, with nothing
written; deleted subtasks left out; the count equal to what the change then clears; a deleted task
404; an Associate 403; a missing date and 30 February 400.

**Doesn't protect.** A subtask's date changed between the count and the save. *Reasoned:* the
question then names a number the save does not keep. The same family as
`check-then-act-in-the-http-layer`, harmless until there are concurrent users.

**Assumes** the count and the clearing read the same rows. A test holds them equal.

---

## 4. Today in the account's timezone

**Protects.** By its test: one moment, 23:30 UTC on 24 October, the 24th in Vancouver and in
`Etc/GMT+8` and the 25th in Zagreb.

**Doesn't protect**

- **A zone the browser does not know.** *(item 6)* The account's timezone is checked by Postgres's
  list, and `todayIn` uses the browser's. Run: of Postgres's 598 names, Node's `Intl` refuses one,
  `Factory`, and `new Intl.DateTimeFormat` throws for it. A subtask's page works out today for
  everyone, for its date box's limit, so an account with `Factory` — reachable only through the API,
  since the register page offers the browser's own zones — opens no subtask: "Something went wrong.
  Try again." The task page itself opens, since New subtask works out today only once it is open.
  *Reasoned:* a browser whose timezone data is older than Postgres's would refuse newer names the
  same way. The cure is for `todayIn` to give no answer when the zone is unknown, and the date box
  no lowest day; the server still checks.

**Assumes** the browser and Postgres know the same zones. All but one.

---

## 5. A task's subtasks, and New subtask

**Protects.** Run in the browser as the seed's Lead, on a task made for it: its subtasks under its
fields, each title a link, "No subtasks yet" when there are none; New subtask's date box offering
2026-11-06, today in Zagreb, to the task's date; the subtask added to the list. By the tests: the
limits, a blank title, the API's refusal in Taskco's words, nothing for an Associate.

**Doesn't protect.** Nothing found, beyond "an overdue task takes no dated subtask", allowed above.

**Assumes** a new subtask's `intent` is read before the field names, since it sends a title as a
rename does. It is, first.

---

## 6. A subtask's page

**Protects.** Run in the browser and by the tests: a subtask opens under its task with its own
fields, a status saved through its own endpoint and shown in the task's list, its date box's
limits, renaming, an Associate's page, another subtask's own values, an unknown id.

**Doesn't protect**

- **A date the server cleared.** *(item 4)* Run: a subtask due 2026-11-25 open under a task due the
  30th; the task's date moved to the 18th with Save anyway. The server cleared the subtask's date, the
  list said TBD, and the subtask's date box still said 2026-11-25, past its own `max`, now
  2026-11-18. `DueDateField` keeps what is in the box as state, `draft`, so a typed date survives a
  refusal — and for the same reason it survives the server changing the date. *Reasoned:* Save date
  there would send 2026-11-25, refused as after its task. Keying `DueDateField` by the date the server
  has would draw it afresh whenever that date changes, and leave it alone after a refusal, which
  changes nothing on the server. *Corrected 2026-11-06, while fixing it:* the key was tried, and it
  redraws the whole field after every save, so the keyboard's focus falls off Save date each time.
  The fix sets the box to the server's date while drawing, when that date changes, and keeps the
  field.

**Assumes** what the page shows is what the server has. Everywhere but the date box.

---

## 7. Asking before a task's date moves (F1)

**Protects.** By its four tests and in the browser: an earlier date asks and saves nothing; Save
anyway saves it and the subtask's date shows TBD; Cancel puts the date back; a date that clears none
saves at once. The fourth passed from the start, and went red with `clears >= 0`.

**Doesn't protect**

- **A date changed while the question shows.** *(item 1)* Run: asked about 2026-11-18, which clears
  2; 2026-11-10 typed into the box; the question read "Moving the date to 2026-11-10 clears the due
  dates of 2 subtasks."; Save anyway saved 2026-11-10, and the count had been asked only for the
  18th. The question names the box's date, `draft`, but its count is the fetcher's. Taking the
  question away as the date changes — `fetcher.reset()` in the box's `onChange` — makes any new date
  ask again.
- **The keyboard's focus.** *(item 2)* Run: while asking, focus is on Save date; after Cancel, and
  after Save anyway, it is on the page itself, because the button pressed was taken off the page.
  Delete, in the same slice, gives it back; this does not. Focus back on the date box after either
  is the cure.
- **One subtask.** *(item 3)* "clears the due dates of 1 subtasks." Seen in the browser. Words that
  depend on the count — one subtask's date, or several subtasks' dates — are the cure.

**Assumes** the box shows the date the question is about. Only until it is changed: item 1.

---

## 8. Deleting

**Protects.** Run in the browser and by the tests: Delete task and Delete subtask each ask, delete,
and go up a page, where it is gone; "Its subtasks go with it" only when there are some; Cancel holds
the focus while asking and the button takes it back; a refusal shown by the button; nothing for an
Associate. The last passed from the start, and went red with Delete subtask shown to everyone.

**Doesn't protect**

- **A refusal after Cancel.** *(item 5)* Run: Delete refused with 502, the words shown; Delete task
  pressed again, the words gone while it asks; Cancel, and the words back, though nothing new was
  tried. They are the fetcher's data, which stays until the next answer. `fetcher.reset()` as the
  question opens is the cure. The same family as `new-project-refusal-outlives-typing`.

**Assumes** the router follows a fetcher's redirect. It does: run in the browser and by the tests.

---

## 9. The tests

**Protects.** One hundred and twenty-three in `web/`, through the real routes, and four hundred and
forty-six at the root. Two tests that passed from the start were broken on purpose to be seen
failing: F1's date that clears none, and Delete's test for an Associate.

**Doesn't protect.** No test types a date while the question shows, item 1; none looks at the focus
after it, item 2; none clears one date, item 3; none moves a task's date with a subtask open, item 4;
none opens Delete again after a refusal, item 5; none uses a zone the browser lacks, item 6.

---

## 10. What the docs said

Nothing found wrong. The reference's step 7b part still says the task page asks the server nothing
and names `TaskFields`; it is 7b's snapshot, and its step 7c part says what changed.

---

## Worth doing before merging

**Items 1 to 4, together, in `DueDateField.tsx`.** Take the question away as the date changes; give
the focus back to the date box after Cancel and Save anyway; words for one subtask or several; and
let the box follow the server's date when it changes, not by a key: see section 6. Each with a test
that does what its item ran. Items 1 to 3
are in Stjepan's F1: his to type, or his to hand over. Item 4 is in Claude's split before F1.

**Item 5**, one line in `Delete.tsx`, with a test, can come with them.

**Item 6** can wait: no screen can make such an account.

**Design section 16's five choices** from building 7c wait for Stjepan's yes or no.
