import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import { createHash } from "node:crypto";
import {
    createUser,
    registerUser,
    createProject,
    addMember,
    listProjectsForUser,
    deleteAccount,
    logIn,
    createSession,
    findSessionUser,
    endSession,
    purgeExpiredSessions,
} from "../queries.js";


//Ana has registered with a password; most tests log in as her
async function registerAna() {
    return registerUser({ email: "ana@example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });
}


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

    it("logs in with the right password, and hands back a session for that account", async () => {
        //CREATE
        const registered = await registerAna();

        //TEST
        const session = await logIn({ email: "ana@example.com", password: "correct horse battery" });

        expect(session?.user.id).toBe(registered.id);
        expect(await findSessionUser(session!.token)).toBe(registered.id);
    });

    it("finds the account whatever the case of the email", async () => {
        //CREATE
        const registered = await registerAna();

        //TEST
        const session = await logIn({ email: "ANA@Example.COM", password: "correct horse battery" });

        expect(session?.user.id).toBe(registered.id);
    });

    it("refuses a wrong password, and makes no session", async () => {
        //CREATE
        await registerAna();

        //TEST
        expect(await logIn({ email: "ana@example.com", password: "wrong horse battery" })).toBeUndefined();

        const sessions = await pool.query("select token_hash from sessions");
        expect(sessions.rows).toHaveLength(0);
    });

    it("refuses an email nobody has, in the same way", async () => {
        //TEST
        expect(await logIn({ email: "nobody@example.com", password: "correct horse battery" })).toBeUndefined();
    });

    it("refuses an account that has no password", async () => {
        //CREATE
        await createUser("ben@example.com", "Europe/Zagreb");

        //TEST
        expect(await logIn({ email: "ben@example.com", password: "" })).toBeUndefined();
    });

    it("reopens an account being deleted when its owner logs in, with the projects it leads", async () => {
        //CREATE
        const registered = await registerAna();
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", registered.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
        await deleteAccount(registered.id);

        //TEST
        const session = await logIn({ email: "ana@example.com", password: "correct horse battery" });

        expect(session?.user.deletion_scheduled_at).toBeNull();
        expect(await listProjectsForUser(ben.id)).toHaveLength(1);
    });

    it("lets two logins at once into an account being deleted, though only one of them can reopen it", async () => {
        //CREATE
        const registered = await registerAna();
        await deleteAccount(registered.id);
        //Two connections open and waiting, as on a running server. Otherwise the second login waits for a new one,
        //which is slow on Windows, and only reads the account after the first has reopened it
        await Promise.all([pool.query("select 1"), pool.query("select 1")]);

        //TEST
        //Like a double-click: both read the account as being deleted, both spend 40 ms on the password, both reopen
        const [first, second] = await Promise.all([
            logIn({ email: "ana@example.com", password: "correct horse battery" }),
            logIn({ email: "ana@example.com", password: "correct horse battery" }),
        ]);

        expect(await findSessionUser(first!.token)).toBe(registered.id);
        expect(await findSessionUser(second!.token)).toBe(registered.id);
    });

    it("refuses an account past its deletion date", async () => {
        //CREATE
        const registered = await registerAna();
        await pool.query("update users set deletion_scheduled_at = now() - interval '1 minute' where id = $1", [registered.id]);

        //TEST
        expect(await logIn({ email: "ana@example.com", password: "correct horse battery" })).toBeUndefined();
    });

    it("stores only a hash of the token it hands out", async () => {
        //CREATE
        const registered = await registerAna();

        //TEST
        const token = await createSession(registered.id);

        const row = await pool.query<{ token_hash: string }>("select token_hash from sessions");
        expect(row.rows[0]?.token_hash).not.toBe(token);
        expect(row.rows[0]?.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    });

    it("finds no one for a token it never handed out", async () => {
        //CREATE
        const registered = await registerAna();
        await createSession(registered.id);

        //TEST
        expect(await findSessionUser("made-up-token")).toBeUndefined();
    });

    it("finds no one for a session past its end", async () => {
        //CREATE
        const registered = await registerAna();
        const token = await createSession(registered.id);
        await pool.query("update sessions set created_at = now() - interval '31 days', expires_at = now() - interval '1 day'");

        //TEST
        expect(await findSessionUser(token)).toBeUndefined();
    });

    it("finds no one once the session is ended", async () => {
        //CREATE
        const registered = await registerAna();
        const token = await createSession(registered.id);

        //TEST
        await endSession(token);

        expect(await findSessionUser(token)).toBeUndefined();
    });

    it("finds no one once the account is being deleted", async () => {
        //CREATE
        const registered = await registerAna();
        const token = await createSession(registered.id);
        await pool.query("update users set deletion_scheduled_at = now() + interval '30 days' where id = $1", [registered.id]);

        //TEST
        expect(await findSessionUser(token)).toBeUndefined();
    });

    it("ends every session of an account being deleted, so reopening it does not bring them back", async () => {
        //CREATE
        const registered = await registerAna();
        const lostLaptop = await createSession(registered.id);
        await deleteAccount(registered.id);

        //TEST
        await logIn({ email: "ana@example.com", password: "correct horse battery" });

        expect(await findSessionUser(lostLaptop)).toBeUndefined();
    });

    it("purges sessions past their end, and keeps the live ones", async () => {
        //CREATE
        const registered = await registerAna();
        const live = await createSession(registered.id);
        const old = await createSession(registered.id);
        await pool.query(
            "update sessions set created_at = now() - interval '31 days', expires_at = now() - interval '1 day' where token_hash = $1",
            [createHash("sha256").update(old).digest("hex")]
        );

        //TEST
        expect(await purgeExpiredSessions()).toEqual({ purged: 1 });

        const left = await pool.query("select token_hash from sessions");
        expect(left.rows).toHaveLength(1);
        expect(await findSessionUser(live)).toBe(registered.id);
    });
});
