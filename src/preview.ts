import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db.js";
import { listProjectsForUser, listTasks, listSubtasks } from "./queries.js";

const userId = process.argv[2] ?? "1";

function escape(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const projects = await listProjectsForUser(userId);

let body = "";

for (const project of projects) {
    body += `<h2>${escape(project.name)}</h2>`;

    const tasks = await listTasks({ projectId: project.id, userId });

    if (tasks.length === 0) {
        body += "<p>No tasks yet.</p>";
        continue;
    }

    body += "<table><tr><th>Position</th><th>Title</th><th>Status</th><th>Priority</th><th>Due</th></tr>";

    for (const task of tasks) {
        body += `<tr>
            <td>${task.position}</td>
            <td>${escape(task.title)}</td>
            <td>${task.status}</td>
            <td>${task.priority ?? "Not set"}</td>
            <td>${task.due_date ?? "TBD"}</td>
        </tr>`;

        const subtasks = await listSubtasks({ taskId: task.id, userId });

        for (const subtask of subtasks) {
            body += `<tr class="subtask">
                <td>${subtask.position}</td>
                <td>&#8627; ${escape(subtask.title)}</td>
                <td>${subtask.status}</td>
                <td>${subtask.priority ?? "Not set"}</td>
                <td>${subtask.due_date ?? "TBD"}</td>
            </tr>`;
        }
    }

    body += "</table>";
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Taskco preview</title>
<style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
    table { border-collapse: collapse; margin-bottom: 2rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.8rem; text-align: left; }
    th { background: #f3f3f3; }
    .subtask td { color: #555; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>Taskco — taskco_dev, as seen by user ${escape(userId)}</h1>
${body}
</body>
</html>`;

const file = path.join(import.meta.dirname, "..", "preview.html");
await writeFile(file, html, "utf8");

console.log(`wrote ${file}`);

await pool.end();