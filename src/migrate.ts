import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { pool } from "./db.js"

const migrationsDir = path.join(import.meta.dirname, "..", "migrations");

await pool.query(`
    create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
    )
`);

const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

const { rows } = await pool.query("select filename from schema_migrations");
const applied = new Set(rows.map((r) => r.filename));


let count = 0;

for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();

    try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
            "insert into schema_migrations (filename) values ($1)",
            [file]
        );
        await client.query("commit");
        console.log(`applied ${file}`);
        count++;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

if (count === 0) console.log("nothing to apply");

await pool.end();

/*
    node:fs/promises is Node's file system API in promise form, so you can await it instead of dealing with callbacks. The node: prefix means "this is Node's own built-in," not something from npm — worth using consistently, because it makes the distinction visible at a glance.

    path joins folder and file names correctly on any OS. Windows uses backslashes; hardcoding / works until it doesn't.
*/