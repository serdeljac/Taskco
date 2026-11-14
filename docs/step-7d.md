# Slice 7d — dragging a task, and a subtask, to a new place

Specified 2026-11-06, from slice 7d's row in [`step-7-prep.md`](./step-7-prep.md), design
sections 7, 11 and 16, and four decisions Stjepan made the same day. The fourth slice of step 7, in
[`learning-path.md`](./learning-path.md). **Built** 2026-11-06 to 2026-11-08 on branch `step-7d`,
from `main` after 7c's merge, and checked in a browser on 2026-11-08; not yet reviewed. Changed on
the way, each for Stjepan's review:

- **F2 went in five steps, each test first:** the handle alone, in a column of its own, "Move";
  the rows handed to dnd-kit; the first keyboard drag, with the rows given sizes; dragged to the
  top or the bottom; and Escape and a title's click.
- **The working rule changed after C7**, by Stjepan: Claude writes no code into the project, C
  pieces included, and gives it instead for Stjepan to type. C4 to C7, written by Claude before
  then, were kept. C8 was typed by Stjepan. The learning path records it.
- **C7 shared rather than copied.** The handle's row, the order a drop sends and the order shown
  while it is on its way, and the test helper that gives rows sizes moved into
  `tasks/SortableRow.tsx`, `tasks/order.ts` and `testing/rowSizes.ts`, for both lists. F2's
  `TaskRow` became a `SortableRow` around `TaskCells`. Design section 16.
- **C6 split the task table** into `TaskTable`, with a handle column only for the Lead, and
  `TaskCells`, the row after the handle; C7 did the same for subtasks.
- **C5 says a drop in place**: "Water was dropped where it was.", beyond the four words the spec
  listed.
- **C8 went in two commits**, the row sliding and then the styles, with `CSS.Translate` rather
  than `CSS.Transform` and a list that only moves up and down. The trap about a lifted table row's
  cells did not happen. Design section 16.
- **A flaky test was fixed** in its own commit: dnd-kit draws its screen-reader text a moment after
  the page, so C5's instructions test waits for it.
- **One item opened**, `handle-click-is-a-drag`, seen in the browser.

**The new pieces were tried on 2026-11-06**, in a throwaway copy of `web/` with classic dnd-kit
unpacked into it, deleted afterwards, and in a throwaway server test:

- a table whose rows are dragged by a handle, by keyboard, with and without the rows measured;
- what dnd-kit says to a screen reader, in its own words and in Taskco's;
- a new subtask under one near the top of the position range.

The traps it found are at the end.

---

## What it must do

The Lead drags a task to a new place in its project's list, by a handle at the start of its row,
with the mouse or the keyboard, and a subtask to a new place in its task's list the same way. The
list shows the new order at once, and puts the row back if the server refuses. An Associate sees no
handles.

Two backend changes first. No migration.

## Done looks like

- **As the Lead, each task's row starts with a handle**, named "Move Dig the beds". Dragging it to
  another place saves the new order; the list shows it at once, and keeps it after the reload.
- **By keyboard:** Tab to the handle, Space picks the row up, the arrow keys move it, Space drops
  it, and Escape puts it back. A screen reader is told in Taskco's words, by title: "Picked up Dig
  the beds."
- **A subtask moves the same way**, in its table on the task's page.
- **A refused move puts the row back** where the server has it, with the refusal in Taskco's words.
- **Clicking a title still opens it.** Only the handle drags.
- **As the Associate**, no handles: the order is the Lead's.
- Both test suites pass, both type checks are clean, and the build too.

## Decided 2026-11-06, by Stjepan

Each as recommended.

- **Classic dnd-kit:** `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0 and `@dnd-kit/utilities`
  3.2.2, pinned exactly, as `web/`'s other packages are. Unchanged since December 2024, and works with
  React 19. *Rejected — `@dnd-kit/react` 0.5.3:* still before 1.0, and changing month to month.
- **A handle on each row**, not the whole row: a title is a link, and a press on it must open it,
  not start a drag. *Rejected — the whole row:* a bigger target, but a press on the title would have
  to be told apart from a drag.
- **The new order shows at once**, while the move is on its way, and otherwise the server's order:
  7b's rule for a choice, for a list. A refusal puts the row back. *Rejected — waiting for the
  server:* the row would jump back to its old place for a moment, then forward.
- **Tried before it is specified**, in a throwaway copy, as above.

Already decided, and built here: reordering subtasks comes with dragging, in 7d (`no-subtask-moves`,
design §16); every move goes through one operation that names two neighbours (design §7); and
dnd-kit, once there is a list to drag (design §11).

## Concepts involved

- A library's hooks: dnd-kit's `DndContext`, `SortableContext` and `useSortable`.
- Sensors: one for the pointer, one for the keyboard.
- A drop as two neighbours: the rows above and below the new place, which is what a move asks for.
- Showing the order being sent while it is on its way: 7b's rule, for a list.
- A live region: what a screen reader is told as a row moves.

## Firsts, for Stjepan to type

Two new kinds of thing. As before: described with `path:line` when it is reached, explained one idea
at a time, and typed by Stjepan, test first. Everything else is Claude's.

| Piece | Kind met | What |
|---|---|---|
| F1 | a package added to `web/` | installing classic dnd-kit, pinned |
| F2 | a list dragged into a new order | the project page's task table, with a handle on each row, by pointer and keyboard |

---

## The pieces, in order

**C** is Claude's, **F** is Stjepan's. Each ends in a test seen failing first.

### The backend

**C1 — move a subtask.** `moveSubtask({ subtaskId, afterSubtaskId?, beforeSubtaskId? })`, a copy of
`moveTask` scoped to the subtask's task: the midpoint of its neighbours, exhaustion found by testing
the result, and that task's subtasks renumbered in the same transaction, by `renumberSubtasks`. The
same refusals as `moveTask`, and a code of its own for a neighbour under another task,
`neighbour-in-another-task`. `PUT /subtasks/:subtaskId/position`, for the Lead:
`{ afterSubtaskId?, beforeSubtaskId? }`, at least one. 204. It closes `no-subtask-moves`.

**C2 — a new subtask makes room first.** A copy of `createTask`'s guard: when the next position would
not fit in an `integer`, the task's subtasks are renumbered before the insert, in one transaction.
Once subtasks move, their positions climb. It closes `subtask-positions-unguarded`.

### Moving tasks

**F1 — install classic dnd-kit.** In `web/`, the three packages at the versions above, saved exactly.
The first package added to `web/` since its setup.

**C3 — the move, in the project page's action.** `projectAction` gains the intent `move-task`:
`PUT /tasks/:taskId/position` with the two neighbours. Taskco's words for the move's refusals. Tests.
An action with an intent is a kind already met, so this comes before F2, as the task page's action
came before F2 in 7b.

**F2 — the first list dragged into a new order.** The project page's task table: a `DndContext` with
a pointer sensor and a keyboard sensor, a `SortableContext` over the tasks' ids, and each row through
`useSortable`, with its handle as the activator. A drop works out the task's two neighbours in the
new order and sends them through a fetcher, with the intent `move-task`. Tests, by keyboard, with the
rows given sizes:

- the Lead moves Buy seeds above Dig the beds, and the right two neighbours are sent;
- moved to the top, only a `before` is sent; to the bottom, only an `after`;
- Escape sends nothing;
- a click on a title opens the task and moves nothing.

**C4 — the new order at once.** While the move is on its way, the table shows the order being sent,
worked out from the fetcher's `formData`; otherwise the server's. A refusal puts the row back, with
the refusal in Taskco's words. Tests.

**C5 — Taskco's words for a screen reader.** The instructions and announcements by title, and nothing
new said for a row over itself. Tests.

**C6 — nothing to drag for an Associate.** No handles, and no `DndContext`. Tests.

### Moving subtasks

**C7 — the same for a task's subtasks.** Copies of F2, C4 and C5 on the task page's subtask table,
sent to the task page's action with the intent `move-subtask`, which asks
`PUT /subtasks/:subtaskId/position`. Tests.

### And the rest

**C8 — the SASS**: the handle, and a row while it is dragged, copies of 7c's.

**C9 — the docs**, as for 7c.

Then Stjepan goes over the commits, and 7d gets its review.

## Pace

An estimate as a stuck-detector, not a deadline: **6 to 10 hours**, most of it in F2 and C4.

---

## Traps

7a's, 7b's and 7c's still apply — above all a choice that shows what the server has, and focus
handed on when a button leaves the page. Five more:

- **jsdom measures nothing, so a keyboard drag lands in the wrong place.** Run: every row 0 by 0, and
  one ArrowUp on the last of three rows moved Water to the top, `{ taskId: "5", beforeTaskId: "3" }`,
  not up one. With each row given 40px, by stubbing `getBoundingClientRect`, one ArrowUp sent
  `{ taskId: "5", afterTaskId: "3", beforeTaskId: "1" }`, and two sent the top. The tests give the
  rows sizes; a test without them can pass for the wrong reason.
- **dnd-kit's own words name ids.** Run: "Draggable item 5 was moved over droppable area 5."
  Taskco's announcements name titles.
- **Right after pick-up, a row is over itself.** Run: with Taskco's words, picking up Water said
  "Water is over Water." The words say nothing new for a row over itself.
- **A subtask's position can reach the top of the range.** Run, in a throwaway server test: one
  subtask at position 2147483600, and a new one under the same task failed with `22003`, "integer out
  of range" — a 500. *Reasoned:* moving a subtask to the bottom adds 65536 each time, so C2 comes
  before anything moves subtasks. Creating and deleting subtasks climbs the same way today, more
  slowly: the limit of fifty counts the visible ones, and the next position counts them all.
- **A table row moves by a CSS transform.** *Reasoned:* a browser draws a transformed `tr`, but its
  cells can change width while it is lifted. Checked in a browser when C8 styles it.

Also run: no warnings with React 19.3; the handle gets `role="button"`, `tabindex="0"`,
`aria-roledescription="sortable"` and `aria-describedby`, pointing at dnd-kit's instructions in
English; and a click on a title moves nothing.
