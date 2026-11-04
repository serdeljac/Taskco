import { Form, Link, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";
import { wordsFor } from "../api/words";

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

export async function registerAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const refusal = refusalFor(email, password);
    if (refusal) {
        return { refusal };
    }

    try {
        // The timezone is the browser's own. Registering logs the new account in at once
        await api<{ user: User }>("POST", "/users", {
            email,
            password,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
    } catch (error) {
        if (error instanceof ApiError) {
            // The password passed the API's own rules above, and the timezone is a name the browser
            // gave, so a body the API refuses has an address its stricter rule does not take
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
            <Form method="post" noValidate>
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
                <button type="submit">Register</button>
            </Form>
            <p>
                Have an account? <Link to="/login">Log in</Link>
            </p>
        </>
    );
}
