import { useLoaderData } from "react-router";
import { api } from "../api/client";
import type { Invite, Project } from "../api/types";
import { Invites } from "./Invites";
import { ProjectList } from "./ProjectList";
import { NewProject } from "./NewProject";

export async function projectsLoader() {
    // Both at once: neither needs the other's answer
    const [{ projects }, { invites }] = await Promise.all([
        api<{ projects: Project[] }>("GET", "/projects"),
        api<{ invites: Invite[] }>("GET", "/invites"),
    ]);
    return { projects, invites };
}

export function ProjectsPage() {
    const { projects, invites } = useLoaderData<typeof projectsLoader>();

    return (
        <>
            <Invites invites={invites} />
            <h1>Projects</h1>
            <NewProject names={projects.map((project) => project.name)} />
            <ProjectList projects={projects} />
        </>
    );
}