import { Link, useParams, useRouteLoaderData } from "react-router";
import type { accountLoader } from "../account/AccountLayout";
import type { projectLoader } from "../projects/ProjectPage";
import { Fields } from "./Fields";
import { Rename } from "./Rename";
import styles from "./TaskPage.module.scss";
import type { taskLoader } from "./TaskPage";
import { todayIn } from "./today";

// One subtask, under its task. Everything it shows is loaded already: the subtask from the task's
// page, the members and the asker's role from the project's, today from the account's timezone. An
// id not in the list is said here, under the task
export function SubtaskPage() {
    const { taskId, subtaskId } = useParams();
    const account = useRouteLoaderData<typeof accountLoader>("account");
    const project = useRouteLoaderData<typeof projectLoader>("project");
    const task = project?.tasks.find((task) => task.id === taskId);
    const subtask = useRouteLoaderData<typeof taskLoader>("task")?.subtasks.find((subtask) => subtask.id === subtaskId);

    if (!account || !project || !task || !subtask) {
        return <p>There's no subtask here.</p>;
    }

    const isLead = project.project.role === "lead";

    // Keyed by the subtask, as the task's page is by the task, so each subtask has fetchers of its own
    return (
        <section key={subtask.id} aria-labelledby="subtask-title" className={styles.task}>
            <h4 id="subtask-title">{subtask.title}</h4>
            {isLead && <Rename field="title" label="Title" current={subtask.title} blankWords="Give the subtask a title" />}
            <Fields
                item={subtask}
                members={project.members}
                isLead={isLead}
                dueDateLimits={{ min: todayIn(account.user.timezone), max: task.due_date ?? undefined }}
            />
            <Link to={`/projects/${project.project.id}/tasks/${task.id}`}>Close subtask</Link>
        </section>
    );
}
