import { useLoaderData } from "react-router";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { ProjectList } from "./ProjectList";

export async function projectsLoader() {
    return api<{ projects: Project[] }>("GET", "/projects");
}

export function ProjectsPage() {
    const { projects } = useLoaderData<typeof projectsLoader>();

    return (
        <>
            <h1>Projects</h1>
            <ProjectList projects={projects} />
        </>
    );
}