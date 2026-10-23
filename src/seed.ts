import "dotenv/config";
import { pool } from "./db.js";
import {
    registerUser,
    createProject,
    addMember,
    createTask,
    createSubtask,
    deleteTask,
    setTaskStatus,
    setTaskPriority,
} from "./queries.js";

await pool.query(
    "truncate table subtasks, tasks, memberships, projects, users restart identity cascade"
);

// A demo password, for this development database only. It is printed below so the accounts can be logged in to
const password = "taskco-demo";

const lead = await registerUser({ email: "lead@example.com", password, timezone: "Europe/Zagreb" });
const associate = await registerUser({ email: "associate@example.com", password, timezone: "Europe/Zagreb" });

const website = await createProject("Website relaunch", lead.id);
await addMember({ projectId: website.id, userId: associate.id, role: "associate" });

const homepage = await createTask({
    projectId: website.id,
    title: "Draft the homepage",
    dueDate: "2026-09-25",
});
await createTask({ projectId: website.id, title: "Pick a font", dueDate: "2026-09-20" });
await createTask({ projectId: website.id, title: "Rewrite the about page" });

const dropped = await createTask({ projectId: website.id, title: "Old idea nobody wants" });
await deleteTask(dropped.id);

await createSubtask({ taskId: homepage.id, title: "Write the headline", dueDate: "2026-09-22" });
await createSubtask({ taskId: homepage.id, title: "Choose a hero image" });

await setTaskStatus({ taskId: homepage.id, status: "in_progress" });
await setTaskPriority({ taskId: homepage.id, priority: "high" });

console.log(`seeded taskco_dev — lead id ${lead.id}, project id ${website.id}`);
console.log(`log in as lead@example.com or associate@example.com, password "${password}"`);

await pool.end();