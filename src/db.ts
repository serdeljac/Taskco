import { Pool, types } from "pg";

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error("DATABASE URL environment variable is not set");
}

types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({connectionString});
