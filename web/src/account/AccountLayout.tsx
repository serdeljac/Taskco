import { Form, Outlet, useLoaderData } from "react-router";
import { api } from "../api/client";
import type { User } from "../api/types";

// Asks who is logged in, before any page inside the layout shows. A 401 goes on to the root's
// error page, which sends every 401 to /login
export async function accountLoader() {
    return api<{ user: User }>("GET", "/account");
}

// Around every page for someone logged in: who they are, a way out, and the page itself
export function AccountLayout() {
    const { user } = useLoaderData<typeof accountLoader>();

    return (
        <>
            <header>
                <span>{user.email}</span>
                <Form method="post" action="/logout">
                    <button type="submit">Log out</button>
                </Form>
            </header>
            <main>
                <Outlet />
            </main>
        </>
    );
}
