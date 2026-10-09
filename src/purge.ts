import "dotenv/config";
import { pool } from "./db.js";
import { purgeDeletedProjects, purgeDeletedAccounts } from "./queries.js";

const projects = await purgeDeletedProjects();
const accounts = await purgeDeletedAccounts();

console.log(
    `purged ${projects.purged} project(s) and ${accounts.purged} account(s) past their deletion date`
);

await pool.end();