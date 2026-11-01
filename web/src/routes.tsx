import type { RouteObject } from "react-router";
import { LoginPage, loginAction } from "./login/LoginPage";
import { ProjectsPage, projectsLoader } from "./projects/ProjectsPage";

export const routes: RouteObject[] = [
    { path: "/login", element: <LoginPage />, action: loginAction },
    { path: "/", element: <ProjectsPage />, loader: projectsLoader },
];