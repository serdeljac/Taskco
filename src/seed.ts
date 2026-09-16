import "dotenv/config";
import { pool } from "./db.js";
import {
    createUser,
    createProject,
    addMember,
    createTask,
    createSubtask,
    deleteTask,
} from "./queries.js";

await pool.query(
    "truncate table subtasks, tasks, memberships, projects, users restart identity cascade"
);

const lead = await createUser("lead@example.com", "Europe/Zagreb");
const associate = await createUser("associate@example.com", "Europe/Zagreb");

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

await pool.query(
    "update tasks set status = 'in_progress', priority = 'high' where id = $1",
    [homepage.id]
);

console.log(`seeded taskco_dev — lead id ${lead.id}, project id ${website.id}`);

await pool.end();