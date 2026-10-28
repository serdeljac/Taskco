import { Form } from "react-router";

export function LoginPage() {
    return (
        <Form method="post">
            <h1>Log in</h1>
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