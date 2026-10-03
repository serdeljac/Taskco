import "dotenv/config";
import { pool } from "./db.js";
import { purgeDeletedProjects } from "./queries.js";

const { purged } = await purgeDeletedProjects();

console.log(`purged ${purged} project(s) past their deletion date`);

await pool.end();