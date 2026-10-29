import type { RouteObject } from "react-router";
import { LoginPage, loginAction } from "./login/LoginPage";

export const routes: RouteObject[] = [
    { path: "/login", element: <LoginPage />, action: loginAction },
];