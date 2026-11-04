import { Form, Link, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";
import { wordsFor } from "../api/words";

// Someone already logged in has no use for the form, so on to /. Here a 401 is the answer, not a
// reason to come to /login: the form shows
export async function loginLoader() {
    try {
        await api<{ user: User }>("GET", "/account");
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            return null;
        }
        throw error;
    }
    return redirect("/");
}

export async function loginAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        await api<{ user: User }>("POST", "/sessions", {
            email: form.get("email"),
            password: form.get("password"),
        });
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }

    return redirect("/");
}

export function LoginPage() {
    const answer = useActionData<typeof loginAction>();

    return (
        <>
            <Form method="post">
                <h1>Log in</h1>
                {answer?.refusal && <p role="alert">{answer.refusal}</p>}
                <label>
                    Email
                    <input type="email" name="email" required />
                </label>
                <label>
                    Password
                    <input type="password" name="password" required />
                </label>
                <button type="submit">Log in</button>
            </Form>
            <p>
                No account yet? <Link to="/register">Register</Link>
            </p>
        </>
    );
}