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

// Every refusal's body. issues comes only with invalid-body, in Zod's English
export type ErrorBody = {
    error: string;
    code: string;
    issues?: unknown;
};
