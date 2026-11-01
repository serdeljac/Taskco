import type { RouteObject } from "react-router";
import { AccountLayout, accountLoader } from "./account/AccountLayout";
import { logoutAction } from "./account/logout";
import { LoginPage, loginAction, loginLoader } from "./login/LoginPage";
import { ProjectsPage, projectsLoader } from "./projects/ProjectsPage";
import { RootError } from "./RootError";

export const routes: RouteObject[] = [
    {
        // Around everything: the error page, and what shows while the first page loads
        errorElement: <RootError />,
        hydrateFallbackElement: <p>Loading…</p>,
        children: [
            {
                // Pages for someone logged in
                element: <AccountLayout />,
                loader: accountLoader,
                children: [{ path: "/", element: <ProjectsPage />, loader: projectsLoader }],
            },
            { path: "/login", element: <LoginPage />, loader: loginLoader, action: loginAction },
            { path: "/logout", action: logoutAction },
        ],
    },
];
