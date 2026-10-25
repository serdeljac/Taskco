// The two kinds of refusal queries.ts can throw. The error handler in app.ts turns a kind into a
// status code, so no route has to read an error's words to know what it means.

// What was named does not exist, or not for the person asking, which is the same answer
export class NotFound extends Error {
    name = "NotFound";
}

// Why a rule said no, for a program to read: the screen turns a code into its own words. A code names a reason,
// not a line of code, so one reason refused in several places has one code. Codes never change once a screen uses them
export type RefusalCode =
    | "email-taken"
    | "unknown-timezone"
    | "account-being-deleted"
    | "account-not-reopenable"
    | "project-being-deleted"
    | "project-not-restorable"
    | "new-lead-not-a-member"
    | "new-lead-being-deleted"
    | "already-lead"
    | "cannot-remove-lead"
    | "own-neighbour"
    | "neighbour-not-found"
    | "no-neighbour"
    | "neighbour-in-another-project"
    | "subtask-limit"
    | "subtask-due-after-task"
    | "assignee-not-a-member"
    | "no-account"
    | "already-a-member"
    | "invite-expired"
    | "not-completed-today";

// It exists, and a rule says no. The message is for whoever reads the terminal; the code is for the screen
export class Refused extends Error {
    name = "Refused";

    constructor(
        readonly code: RefusalCode,
        message: string
    ) {
        super(message);
    }
}
