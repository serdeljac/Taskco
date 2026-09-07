import { config } from "dotenv";

config({ path: ".env.test" });

if (!process.env.DATABASE_URL?.endsWith("_test")) {
    throw new Error(
        "Refusing to run: DATABASE_URL must name a database ending in _test"
    );
}