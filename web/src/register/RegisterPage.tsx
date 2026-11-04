import { Form, Link, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";
import { wordsFor } from "../api/words";
import styles from "../AccountForm.module.scss";

const notAnAddress = "That doesn't look like an email address.";

// The API's rules for a new account, checked in the browser before anything is sent, in Taskco's
// words. The password's are the API's exactly; the address's are looser, and the API checks again
function refusalFor(email: string, password: string): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return notAnAddress;
    }
    if (password.length < 8 || password.length > 128) {
        return "A password needs 8 to 128 characters.";
    }
    return null;
}

// The browser's own timezone, or undefined: a computer set to a zone too new for the browser's data
// gets no name, and then the person is asked
function namedTimezone(): string | undefined {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
}

// A guess from the clock, chosen already when the person is asked: 480 minutes behind UTC is
// Etc/GMT+8, the sign reversed as the timezone database writes it. Only a guess: the same data that
// cannot name the zone can get the clock wrong too, an hour behind on this machine
function clockGuess(): { zone: string; words: string } {
    const hours = new Date().getTimezoneOffset() / 60;
    return {
        zone: `Etc/GMT${hours < 0 ? "-" : "+"}${Math.abs(hours)}`,
        words: `UTC${hours > 0 ? "-" : "+"}${Math.abs(hours)} (a guess from this computer's clock)`,
    };
}

// Shown only when the browser names no zone: every zone it knows, with the clock's guess first
function TimezoneField() {
    const guess = clockGuess();

    return (
        <>
            <p>Your browser doesn't say which timezone you're in, so choose yours.</p>
            <label>
                Timezone
                <select name="timezone" defaultValue={guess.zone}>
                    <option value={guess.zone}>{guess.words}</option>
                    {Intl.supportedValuesOf("timeZone").map((zone) => (
                        <option key={zone} value={zone}>
                            {zone}
                        </option>
                    ))}
                </select>
            </label>
        </>
    );
}

export async function registerAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const refusal = refusalFor(email, password);
    if (refusal) {
        return { refusal };
    }

    try {
        // The browser's zone, or the one chosen from the list. Registering logs the new account in at once
        const timezone = namedTimezone() ?? String(form.get("timezone"));
        await api<{ user: User }>("POST", "/users", { email, password, timezone });
    } catch (error) {
        if (error instanceof ApiError) {
            // The password passed the API's own rules above, and there is always a timezone to send,
            // so a body the API refuses has an address its stricter rule does not take
            return { refusal: error.code === "invalid-body" ? notAnAddress : wordsFor(error.code) };
        }
        throw error;
    }

    return redirect("/");
}

// noValidate: the browser's own checks would refuse in its words first, so the action's run instead
export function RegisterPage() {
    const answer = useActionData<typeof registerAction>();

    return (
        <>
            <Form method="post" noValidate className={styles.form}>
                <h1>Register</h1>
                {answer?.refusal && <p role="alert">{answer.refusal}</p>}
                <label>
                    Email
                    <input type="email" name="email" autoComplete="email" />
                </label>
                <label>
                    Password
                    <input type="password" name="password" autoComplete="new-password" />
                </label>
                {namedTimezone() === undefined && <TimezoneField />}
                <button type="submit">Register</button>
            </Form>
            <p>
                Have an account? <Link to="/login">Log in</Link>
            </p>
        </>
    );
}
