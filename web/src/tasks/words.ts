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
