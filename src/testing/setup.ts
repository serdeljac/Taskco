import "./env.js";
import { pool } from "../db.js";
import { beforeEach, afterAll } from "vitest";

beforeEach(async () => {
    await pool.query(
        "truncate table memberships, projects, users restart identity cascade"
    );
});

afterAll(async () => {
    await pool.end();
});