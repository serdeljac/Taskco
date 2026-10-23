// The two kinds of refusal queries.ts can throw. The error handler in app.ts turns a kind into a
// status code, so no route has to read an error's words to know what it means.

// What was named does not exist, or not for the person asking, which is the same answer
export class NotFound extends Error {
    name = "NotFound";
}

// It exists, and a rule says no
export class Refused extends Error {
    name = "Refused";
}
