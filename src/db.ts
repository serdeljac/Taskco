import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error("DATABASE URL environment variable is not set");
}

export const pool = new Pool({connectionString});


/*
    import { Pool } from "pg";
    Pool is a class the pg package provides. Note there's no file extension — that rule only applies to your own files. Bare package names never take one; relative paths always do. Two different kinds of import, two different rules.

    const connectionString = process.env.DATABASE_URL;
    process.env is Node's view of environment variables — a plain object of strings. dotenv will have put your .env contents into it before this runs. TypeScript types every entry as string | undefined, because nothing guarantees a variable was set.

    if (!connectionString) { throw ... }
    Two jobs at once. Practically: the app dies at startup with a message naming the actual problem, instead of failing later with something cryptic about connecting to undefined.

    Technically, this is type narrowing — after this block, TypeScript knows connectionString cannot be undefined, because the only path past it is the one where it has a value. That's why the next line compiles. Without the check, strict mode rejects it.

    export const pool = new Pool({ connectionString });
    Creates the pool and makes it available to other files.

    The important part is when this runs: a module's body executes once, the first time anything imports it, and the result is cached. Every file that imports pool gets the same one. That's what makes "one module owns the pool" true — it's enforced by how modules work, not by you remembering.

    { connectionString } is shorthand for { connectionString: connectionString }




    db.ts — the connection to the database.

    It does three things: reads the database address out of .env, stops the program immediately if that address is missing, and opens a small set of connections to Postgres that stay ready for use.

    It exists so that one file in the whole project knows how to reach the database. Every future part — the migration runner, every query in slice A, every endpoint in step 5 — imports the connection from here rather than making its own. If each file opened its own, you'd have dozens of connections nobody is counting, and changing the database address would mean editing dozens of files.

    The "pool" part just means: opening a connection is slow, so instead of opening a new one for every query and throwing it away, it keeps a few open and lends them out.

    This file is permanent. It'll still be here at step 7.
 */