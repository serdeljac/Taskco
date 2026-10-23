import { createSession } from "../queries.js";

// The Cookie header a browser logged in as this user would send. Tests use it in place of logging in through
// POST /sessions, which would cost an Argon2 hash every time
export async function cookieFor(user: { id: string }): Promise<string> {
    return `taskco_session=${await createSession(user.id)}`;
}
