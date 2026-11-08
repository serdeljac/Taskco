import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";
import type { DueDate, Member, Priority, Role, TaskStatus } from "../api/types";

// The words a person reads for a task's fields. The API's values are for programs: "on_hold" is
// shown as "On hold". An empty field has words of its own, never a blank

const statuses: Record<TaskStatus, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    on_hold: "On hold",
    completed: "Completed",
};

const priorities: Record<Priority, string> = {
    low: "Low",
    med: "Med",
    high: "High",
};

const roles: Record<Role, string> = {
    lead: "Lead",
    associate: "Associate",
};

export function roleWords(role: Role): string {
    return roles[role];
}

export function statusWords(status: TaskStatus): string {
    return statuses[status];
}

export function priorityWords(priority: Priority | null): string {
    return priority === null ? "Not set" : priorities[priority];
}

// The day as the text it is, never through new Date()
export function dueDateWords(dueDate: DueDate | null): string {
    return dueDate ?? "TBD";
}

// The assignee is a membership; the members list holds the email
export function assigneeWords(membershipId: string | null, members: Member[]): string {
    return members.find((member) => member.membership_id === membershipId)?.email ?? "Nobody";
}

// The question before a task's date moves: one subtask's date, or several subtasks' dates
export function clearsWords(dueDate: string, clears: number): string {
    const what = clears === 1 ? "the due date of 1 subtask" : `the due dates of ${clears} subtasks`;
    return `Moving the date to ${dueDate} clears ${what}.`;
}

// How to move a row by keyboard, read out when its handle has the focus
export const dragInstructions =
    "Press Space or Enter to pick the row up, the arrow keys to move it, Space or Enter to drop it, and Escape to put it back.";

// What a screen reader is told as a row is dragged, by title: dnd-kit's own words name ids. A row is
// over itself the moment it is picked up, and nothing new is said there, so the pick-up is heard
export function dragWords(rows: { id: string; title: string }[]): Announcements {
    const titleOf = (id: UniqueIdentifier) => rows.find((row) => row.id === String(id))?.title ?? "";
    return {
        onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
        onDragOver: ({ active, over }) =>
            over && over.id !== active.id ? `${titleOf(active.id)} is over ${titleOf(over.id)}.` : undefined,
        onDragEnd: ({ active, over }) =>
            over && over.id !== active.id
                ? `${titleOf(active.id)} was dropped over ${titleOf(over.id)}.`
                : `${titleOf(active.id)} was dropped where it was.`,
        onDragCancel: ({ active }) => `${titleOf(active.id)} was put back.`,
    };
}
