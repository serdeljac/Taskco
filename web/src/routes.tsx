import type { RouteObject } from "react-router";
import { LoginPage } from "./login/LoginPage";

export const routes: RouteObject[] = [
    { path: "/login", element: <LoginPage /> },
];