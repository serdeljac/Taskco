import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import { createUser } from "../queries.js";


describe("sessions", () => {
    it("refuses a session token stored unhashed", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        await expect(
            pool.query(
                "insert into sessions (token_hash, user_id, expires_at) values ('a-token-anyone-could-use', $1, now() + interval '1 day')",
                [ana.id]
            )
        ).rejects.toMatchObject({ code: "23514", constraint: "sessions_token_is_hashed" });
    });

    it("refuses a session that ends before it begins", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        await expect(
            pool.query(
                "insert into sessions (token_hash, user_id, expires_at) values (repeat('a', 64), $1, now() - interval '1 day')",
                [ana.id]
            )
        ).rejects.toMatchObject({ code: "23514", constraint: "sessions_expire_after_created" });
    });

    it("goes with its account when the account is purged", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await pool.query(
            "insert into sessions (token_hash, user_id, expires_at) values (repeat('a', 64), $1, now() + interval '1 day')",
            [ana.id]
        );

        //TEST
        await pool.query("delete from users where id = $1", [ana.id]);

        const sessions = await pool.query("select token_hash from sessions");
        expect(sessions.rows).toHaveLength(0);
    });
});
