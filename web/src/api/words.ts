// The words a person reads for each code. The server's own sentences are for developers. A Map, not
// a plain object, so a code like "toString" finds nothing instead of a function every object has
const words = new Map<string, string>([
    ["wrong-email-or-password", "The email or password is wrong."],
    ["email-taken", "An account already uses that email. Log in instead?"],
    ["unknown-timezone", "Your browser's timezone isn't one Taskco knows."],
    ["unreachable", "Taskco can't be reached. Is the server running?"],
    ["subtask-due-after-task", "A subtask can't be due after its task."],
    ["subtask-due-before-today", "A subtask can't be due before today."],
    ["subtask-limit", "A task can have at most 50 subtasks."],
    // A move names its neighbours, and one was deleted meanwhile; the reload shows the list as it is now
    ["neighbour-not-found", "The list changed while you were moving it. Try again."],
    ["invite-expired", "That invite has expired. Ask for a new one."],
    ["no-account", "No Taskco account uses that email."],
    ["already-a-member", "They are already a member of this project."],
    ["new-lead-not-a-member", "They are no longer a member of this project."],
    ["new-lead-being-deleted", "Their account is being deleted, so they can't lead."],
    ["already-lead", "They already lead this project."],
    ["project-being-deleted", "This project is being deleted, so it can't be changed."],
    ["project-not-restorable", "This project can no longer be brought back."],
    ["not-completed-today", "It wasn't marked done today."],
]);

export function wordsFor(code: string): string {
    return words.get(code) ?? "Something went wrong. Try again.";
}
