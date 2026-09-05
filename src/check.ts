import "dotenv/config";
import { pool } from "./db.js"

const result = await pool.query("SELECT now()")
console.log(result.rows)
await pool.end()


/* 
    import "dotenv/config";
    An import with no braces and nothing assigned — a side-effect import. You're not taking anything out of the module; you're running it for what it does. What it does is read .env and load it into process.env.

    It must be the first import. ESM evaluates imports top to bottom, all of them, before your file's own code runs. So this finishes before ./db.js is evaluated — which matters, because db.ts reads process.env the moment it's loaded. Put it second and the variable is empty.

    import { pool } from "./db.js";
    Your own file, so: relative path, and it needs the extension. You write .js even though the file is db.ts, because you're naming it as it exists at runtime.

    const result = await pool.query("SELECT now()");
    SELECT now() asks Postgres for its current time — the simplest query that proves a real round trip happened.

    await at the top level of a file is legal in ESM. No wrapper function.

    console.log(result.rows);
    pool.query gives back an object with several fields. rows is the one you want: an array of objects, one per row, keyed by column name.

    await pool.end();
    Closes every connection in the pool. Node exits when nothing is left that could still do work — an open pool is idle connections waiting for queries, which counts. This line is why the process ends instead of sitting there.


    check.ts — proof that all of it actually works.

    It asks Postgres one trivial question ("what time is it?"), prints the answer, and closes the connections.

    It exists because until something really queried the database, you had no idea whether the setup was correct. There were about eight things that each had to be right: Postgres installed, the role created, the password matching, the database owned properly, .env written correctly, dotenv loading it, TypeScript configured, ESM imports resolving. Any one of them wrong and nothing works — and the error you'd get would rarely point at the actual cause.

    That timestamp printing is a single fact that proves all eight at once.

    This file is scaffolding. It gets deleted once real tests exist in step 2 — they'll prove the same thing continuously, as a side effect of testing real behaviour.
*/