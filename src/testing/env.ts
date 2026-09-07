import { config } from "dotenv";
import path from "node:path";

config({
    path: path.join(import.meta.dirname, "..", "..", ".env.test"),
    quiet: true,
});

if (!process.env.DATABASE_URL?.endsWith("_test")) {
    throw new Error(
        "Refusing to run: DATABASE_URL must name a database ending in _test"
    );
}
