// What the API sends, as it arrives. JSON has no dates and no big integers, so ids and moments are
// text. Written by hand from the reference's endpoint tables: nothing checks them, so a column added
// or renamed on the server must be changed here too

export type Role = "lead" | "associate";

export type User = {
    id: string;
    email: string;
    timezone: string;
    created_at: string;
    deletion_scheduled_at: string | null;
};

// A project as GET /api/projects lists it, with the asker's role in it
export type Project = {
    id: string;
    name: string;
    created_at: string;
    deletion_scheduled_at: string | null;
    role: Role;
};

// A calendar day, "2026-11-20". Shown and compared as the text it is: new Date() would read it as
// midnight UTC, the day before anywhere west of it
export type DueDate = string;

export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed";

// null is "Not set": nobody has decided yet, which is different from Low
export type Priority = "low" | "med" | "high";

// A task as GET /api/projects/:projectId/tasks lists it, in the order it is sent. Its assignee is a
// membership, not a user: the members list says whose
export type Task = {
    id: string;
    project_id: string;
    title: string;
    status: TaskStatus;
    priority: Priority | null;
    due_date: DueDate | null;
    notes: string | null;
    assignee_membership_id: string | null;
    position: number;
    created_at: string;
    deleted_at: string | null;
};

// A current member, as GET /api/projects/:projectId/members lists them, the Lead first
export type Member = {
    membership_id: string;
    user_id: string;
    email: string;
    role: Role;
    joined_at: string;
};

// Every refusal's body. issues comes only with invalid-body, in Zod's English
export type ErrorBody = {
    error: string;
    code: string;
    issues?: unknown;
};
