import type { DueDate, Member, Priority, TaskStatus } from "../api/types";

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
