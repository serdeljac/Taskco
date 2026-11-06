import { data, Link, Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { api } from "../api/client";
import type { Member, Project, Task } from "../api/types";
import { NewTask } from "../tasks/NewTask";
import { Rename } from "../tasks/Rename";
import { assigneeWords, dueDateWords, priorityWords, roleWords, statusWords } from "../tasks/words";

export async function projectLoader({ params }: LoaderFunctionArgs) {
    const { projects } = await api<{ projects: Project[] }>("GET", "/projects");
    const project = projects.find((project) => project.id === params.projectId);
    if (!project) {
        throw data(null, { status: 404 });
    }

    // Both at once: neither needs the other's answer
    const [{ tasks }, { members }] = await Promise.all([
        api<{ tasks: Task[] }>("GET", `/projects/${project.id}/tasks`),
        api<{ members: Member[] }>("GET", `/projects/${project.id}/members`),
    ]);
    return { project, tasks, members };
}

export function ProjectPage() {
    const { project, tasks, members } = useLoaderData<typeof projectLoader>();

    return (
        <>
            <p>
                <Link to="/">All projects</Link>
            </p>
            <h1>{project.name}</h1>
            {project.role === "lead" && (
                <Rename key={project.id} field="name" label="Name" current={project.name} blankWords="Give the project a name" />
            )}

            <h2>Tasks</h2>
            {/* Only the Lead creates tasks: the API refuses anyone else */}
            {project.role === "lead" && <NewTask />}
            {tasks.length === 0 ? (
                <p>No tasks yet</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Task</th>
                            <th scope="col">Status</th>
                            <th scope="col">Priority</th>
                            <th scope="col">Due</th>
                            <th scope="col">Assigned to</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map((task) => (
                            <tr key={task.id}>
                                <td>
                                    <Link to={`tasks/${task.id}`}>{task.title}</Link>
                                </td>
                                <td>{statusWords(task.status)}</td>
                                <td>{priorityWords(task.priority)}</td>
                                <td>{dueDateWords(task.due_date)}</td>
                                <td>{assigneeWords(task.assignee_membership_id, members)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* The task opened from the list, if one is: /projects/7/tasks/3 */}
            <Outlet />

            <h2 id="members">Members</h2>
            <ul aria-labelledby="members">
                {members.map((member) => (
                    <li key={member.membership_id}>
                        {member.email}, {roleWords(member.role)}
                    </li>
                ))}
            </ul>
        </>
    );
}
