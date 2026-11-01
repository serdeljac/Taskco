import { redirect } from "react-router";
import { api } from "../api/client";

// Ends this session, then goes to /login. If it had already ended, in another tab say, the API
// answers 401, and the root's error page sends that to /login too
export async function logoutAction() {
    await api<void>("DELETE", "/sessions/current");
    return redirect("/login");
}
