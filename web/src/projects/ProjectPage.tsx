import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { api } from "../api/client";
import type { Project, Task } from "../api/types";

export async function projectLoader({ params }: LoaderFunctionArgs) {
    const { projects } = await api<{ projects: Project[] }>("GET", "/projects");
    const project = projects.find((project) => project.id === params.projectId);
    if (!project) {
        throw data(null, { status: 404 });
    }

    const { tasks } = await api<{ tasks: Task[] }>("GET", `/projects/${project.id}/tasks`);
    return { project, tasks };
}

export function ProjectPage() {
    const { project, tasks } = useLoaderData<typeof projectLoader>();

    return (
        <>
            <h1>{project.name}</h1>
            <ul>
                {tasks.map((task) => (
                    <li key={task.id}>{task.title}</li>
                ))}
            </ul>
        </>
    );
}