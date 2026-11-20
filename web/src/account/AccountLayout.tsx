import { Form, NavLink, Outlet, useLoaderData } from "react-router";
import { api } from "../api/client";
import type { User } from "../api/types";
import styles from "./AccountLayout.module.scss";

// Asks who is logged in, before any page inside the layout shows. A 401 goes on to the root's
// error page, which sends every 401 to /login
export async function accountLoader() {
    return api<{ user: User }>("GET", "/account");
}

// Around every page for someone logged in: the two places to go, who they are, a way out, and the
// page itself. NavLink marks the place shown with aria-current="page"; end keeps / from matching
// every path under it
export function AccountLayout() {
    const { user } = useLoaderData<typeof accountLoader>();

    return (
        <>
            <header className={styles.header}>
                <nav className={styles.nav}>
                    <NavLink to="/" end>
                        Projects
                    </NavLink>
                    <NavLink to="/routines">Routines</NavLink>
                </nav>
                <span className={styles.who}>{user.email}</span>
                <Form method="post" action="/logout">
                    <button type="submit">Log out</button>
                </Form>
            </header>
            <main className={styles.main}>
                <Outlet />
            </main>
        </>
    );
}