import { useLoaderData } from "react-router";
import { api } from "../api/client";
import type { Member, Project } from "../api/types";
import { HandOver } from "./HandOver";
import styles from "./style/AccountPage.module.scss";

// The projects the asker leads and is not already deleting, each with its other members, asked for
// all at once. GET /projects carries the asker's role, so no other list is needed
export async function accountPageLoader() {
    const { projects } = await api<{ projects: Project[] }>("GET", "/projects");
    const led = projects.filter((project) => project.role === "lead" && !project.deletion_scheduled_at);
    const lists = await Promise.all(
        led.map((project) => api<{ members: Member[] }>("GET", `/projects/${project.id}/members`))
    );
    return {
        led: led.map((project, i) => ({
            project,
            members: (lists[i]?.members ?? []).filter((member) => member.role !== "lead"),
        })),
    };
}

// /account: before an account goes, every project it leads is handed to a member, or left to be
// deleted with it. Handing over makes the asker an Associate, so the project leaves this list
export function AccountPage() {
    const { led } = useLoaderData<typeof accountPageLoader>();

    return (
        <>
            <h1>Account</h1>
            <h2>Projects you lead</h2>
            {led.length === 0 ? (
                <p>You lead no projects.</p>
            ) : (
                <>
                    <p>If you delete your account, these are deleted with it. Hand any you want kept to one of its members first.</p>
                    <ul className={styles.led}>
                        {led.map(({ project, members }) => (
                            <li key={project.id}>
                                <HandOver project={project} members={members} />
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}