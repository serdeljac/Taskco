import "dotenv/config";
import { pool } from "./db.js";
import { purgeDeletedProjects, purgeDeletedAccounts, purgeExpiredSessions } from "./queries.js";

const projects = await purgeDeletedProjects();
const accounts = await purgeDeletedAccounts();
const sessions = await purgeExpiredSessions();

console.log(
    `purged ${projects.purged} project(s) and ${accounts.purged} account(s) past their deletion date, ` +
        `and ${sessions.purged} session(s) past their end`
);

await pool.end();
