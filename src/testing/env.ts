import { config } from "dotenv";
import path from "node:path";
import { isTestDatabase } from "./guard.js";

config({
    path: path.join(import.meta.dirname, "..", "..", ".env.test"),
    quiet: true,
});

const url = process.env.DATABASE_URL;

if (!url || !isTestDatabase(url)) {
    throw new Error(
        "Refusing to run: DATABASE_URL must name a database ending in _test"
    );
}