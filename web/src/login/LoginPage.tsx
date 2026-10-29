import { Form, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";
import { wordsFor } from "../api/words";

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
    );
}