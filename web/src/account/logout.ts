import { redirect } from "react-router";
import { api } from "../api/client";

// Ends this session, then goes to /login. If it had already ended, in another tab say, the API
// answers 401, and the root's error page sends that to /login too
export async function logoutAction() {
    await api<void>("DELETE", "/sessions/current");
    return redirect("/login");
}

// A visit to /logout, typed or followed, has nothing to show, and must not change anything: logging
// out is the button. So it goes on to /, or from there to /login for someone logged out
export function logoutLoader() {
    return redirect("/");
}
