import type { RouteObject } from "react-router";
import { AccountLayout, accountLoader } from "./account/AccountLayout";
import { logoutAction, logoutLoader } from "./account/logout";
import { LoginPage, loginAction, loginLoader } from "./login/LoginPage";
import { createProjectAction } from "./projects/createProject";
import { ProjectsPage, projectsLoader } from "./projects/ProjectsPage";
import { ProjectPage, projectLoader } from "./projects/ProjectPage";
import { RegisterPage, registerAction } from "./register/RegisterPage";
import { RootError } from "./RootError";
import { projectAction } from "./projects/projectAction";
import { TaskPage, taskLoader } from "./tasks/TaskPage";
import { updateTaskAction } from "./tasks/updateTask";

export const routes: RouteObject[] = [
    {
        // Around everything: the error page, and what shows while the first page loads
        errorElement: <RootError />,
        hydrateFallbackElement: <p>Loading…</p>,
        children: [
            {
                // Pages for someone logged in. The id lets a page read the account, for its timezone
                id: "account",
                element: <AccountLayout />,
                loader: accountLoader,
                children: [
                    {
                        id: "projects",
                        path: "/",
                        element: <ProjectsPage />,
                        loader: projectsLoader,
                        action: createProjectAction,
                    },
                    {
                        id: "project",
                        path: "/projects/:projectId",
                        element: <ProjectPage />,
                        loader: projectLoader,
                        action: projectAction,
                        // One task, shown under the project's list through its Outlet
                        children: [
                            { id: "task", path: "tasks/:taskId", element: <TaskPage />, loader: taskLoader, action: updateTaskAction },
                        ],
                    },
                ],
            },
            { path: "/login", element: <LoginPage />, loader: loginLoader, action: loginAction },
            // The same loader as /login's: someone already logged in has no use for either form
            { path: "/register", element: <RegisterPage />, loader: loginLoader, action: registerAction },
            { path: "/logout", loader: logoutLoader, action: logoutAction },
        ],
    },
];