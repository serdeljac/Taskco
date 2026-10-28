// The words a person reads for each code. The server's own sentences are for developers. A Map, not
// a plain object, so a code like "toString" finds nothing instead of a function every object has
const words = new Map<string, string>([
    ["wrong-email-or-password", "The email or password is wrong."],
    ["email-taken", "An account already uses that email. Log in instead?"],
    ["unknown-timezone", "Your browser's timezone isn't one Taskco knows."],
    ["unreachable", "Taskco can't be reached. Is the server running?"],
]);

export function wordsFor(code: string): string {
    return words.get(code) ?? "Something went wrong. Try again.";
}
