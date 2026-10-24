import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, createSession, endSession, registerUser, deleteAccount } from "../queries.js";
import { cookieFor } from "../testing/session.js";


//Every cookie a response set, as the browser receives them
function cookiesFrom(response: request.Response): string[] {
    return ([] as string[]).concat(response.get("Set-Cookie") ?? []);
}

//The session cookie a response set, as the pair a browser sends back: "taskco_session=…"
function sessionFrom(response: request.Response): string | undefined {
    return cookiesFrom(response).find((c) => c.startsWith("taskco_session=") && !c.startsWith("taskco_session=;"))?.split(";")[0];
}

//Ana registers with a password, as POST /users would
async function registerAna() {
    return registerUser({ email: "ana@example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });
}


describe("who is asking", () => {
    it("lets in a request carrying a live session", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);
        expect(response.body.projects).toHaveLength(1);
    });

    it("no longer believes an X-User-Id header", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: "Log in first" });
    });

    it("refuses a session that has ended", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const token = await createSession(ana.id);
        await endSession(token);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", `taskco_session=${token}`);

        expect(response.status).toBe(401);
    });

    it("refuses a token it never handed out", async () => {
        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", "taskco_session=made-up-token");

        expect(response.status).toBe(401);
    });

    it("finds its own cookie among others", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", `theme=dark; ${await cookieFor(ana)}; lang=hr`);

        expect(response.status).toBe(200);
    });
});


describe("POST /users", () => {
    it("registers an account, logs it in, and hands it back without its password", async () => {
        //TEST
        const response = await request(app)
            .post("/users")
            .send({ email: "ana@example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });

        expect(response.status).toBe(201);
        expect(response.body.user).toMatchObject({ email: "ana@example.com", timezone: "Europe/Zagreb" });
        expect(response.body.user).not.toHaveProperty("password_hash");

        const session = sessionFrom(response);
        expect(session).toBeDefined();

        const account = await request(app).get("/account").set("Cookie", session!);
        expect(account.body.user.email).toBe("ana@example.com");
    });

    it("sets a cookie page scripts cannot read, sent only to this site, over a secure connection", async () => {
        //TEST
        const response = await request(app)
            .post("/users")
            .send({ email: "ana@example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });

        const cookie = cookiesFrom(response).find((c) => c.startsWith("taskco_session="));
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Strict");
        expect(cookie).toContain("Path=/");
    });

    it("answers 409 for an email that already has an account", async () => {
        //CREATE
        await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/users")
            .send({ email: "Ana@Example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "an account already uses that email" });
        expect(sessionFrom(response)).toBeUndefined();
    });

    it("answers 409 for a timezone the server does not know", async () => {
        //TEST
        const response = await request(app)
            .post("/users")
            .send({ email: "ana@example.com", password: "correct horse battery", timezone: "Mars/Olympus" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "that timezone is not one the server knows" });
    });

    it("refuses a password shorter than eight characters", async () => {
        //TEST
        const response = await request(app)
            .post("/users")
            .send({ email: "ana@example.com", password: "horse", timezone: "Europe/Zagreb" });

        expect(response.status).toBe(400);
    });

    it("refuses an address that is not an email", async () => {
        //TEST
        const response = await request(app)
            .post("/users")
            .send({ email: "ana at example", password: "correct horse battery", timezone: "Europe/Zagreb" });

        expect(response.status).toBe(400);
    });

    it("ends the session whose cookie the new account's replaces", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const old = await cookieFor(ana);

        //TEST
        const response = await request(app)
            .post("/users")
            .set("Cookie", old)
            .send({ email: "ben@example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });

        expect(response.status).toBe(201);

        const withOld = await request(app).get("/account").set("Cookie", old);
        expect(withOld.status).toBe(401);
    });
});


describe("POST /sessions", () => {
    it("logs in, and sets the session cookie", async () => {
        //CREATE
        const ana = await registerAna();

        //TEST
        const response = await request(app)
            .post("/sessions")
            .send({ email: "ana@example.com", password: "correct horse battery" });

        expect(response.status).toBe(201);
        expect(response.body.user.id).toBe(ana.id);

        const projects = await request(app).get("/projects").set("Cookie", sessionFrom(response)!);
        expect(projects.status).toBe(200);
    });

    it("answers 401 to a wrong password, and sets no cookie", async () => {
        //CREATE
        await registerAna();

        //TEST
        const response = await request(app)
            .post("/sessions")
            .send({ email: "ana@example.com", password: "wrong horse battery" });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: "The email or password is wrong" });
        expect(sessionFrom(response)).toBeUndefined();
    });

    it("answers an email nobody has in exactly the same words", async () => {
        //TEST
        const response = await request(app)
            .post("/sessions")
            .send({ email: "nobody@example.com", password: "correct horse battery" });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: "The email or password is wrong" });
    });

    it("reopens an account being deleted", async () => {
        //CREATE
        const ana = await registerAna();
        await deleteAccount(ana.id);

        //TEST
        const response = await request(app)
            .post("/sessions")
            .send({ email: "ana@example.com", password: "correct horse battery" });

        expect(response.status).toBe(201);
        expect(response.body.user.deletion_scheduled_at).toBeNull();
    });

    it("ends the session whose cookie the new one replaces", async () => {
        //CREATE
        const ana = await registerAna();
        const old = await cookieFor(ana);

        //TEST
        const response = await request(app)
            .post("/sessions")
            .set("Cookie", old)
            .send({ email: "ana@example.com", password: "correct horse battery" });

        expect(response.status).toBe(201);

        const withOld = await request(app).get("/account").set("Cookie", old);
        expect(withOld.status).toBe(401);
    });

    it("leaves the session it was sent with alone when the password is wrong", async () => {
        //CREATE
        const ana = await registerAna();
        const old = await cookieFor(ana);

        //TEST
        const response = await request(app)
            .post("/sessions")
            .set("Cookie", old)
            .send({ email: "ana@example.com", password: "wrong horse battery" });

        expect(response.status).toBe(401);

        const withOld = await request(app).get("/account").set("Cookie", old);
        expect(withOld.status).toBe(200);
    });

    it("refuses a body with a field it did not ask for", async () => {
        //CREATE
        await registerAna();

        //TEST
        const response = await request(app)
            .post("/sessions")
            .send({ email: "ana@example.com", password: "correct horse battery", userId: "1" });

        expect(response.status).toBe(400);
    });
});


describe("DELETE /sessions/current", () => {
    it("logs out: the cookie stops working, and the browser is told to forget it", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cookie = await cookieFor(ana);

        //TEST
        const response = await request(app)
            .delete("/sessions/current")
            .set("Cookie", cookie);

        expect(response.status).toBe(204);
        expect(cookiesFrom(response).join()).toContain("taskco_session=;");

        const after = await request(app).get("/projects").set("Cookie", cookie);
        expect(after.status).toBe(401);
    });

    it("ends only the session it was sent with", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const laptop = await cookieFor(ana);
        const phone = await cookieFor(ana);

        //TEST
        await request(app).delete("/sessions/current").set("Cookie", laptop);

        const fromPhone = await request(app).get("/projects").set("Cookie", phone);
        expect(fromPhone.status).toBe(200);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).delete("/sessions/current");

        expect(response.status).toBe(401);
    });
});


describe("GET /account", () => {
    it("answers who is logged in, without their password", async () => {
        //CREATE
        const ana = await registerAna();

        //TEST
        const response = await request(app)
            .get("/account")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);
        expect(response.body.user).toMatchObject({ id: ana.id, email: "ana@example.com", timezone: "Europe/Zagreb" });
        expect(response.body.user).not.toHaveProperty("password_hash");
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/account");

        expect(response.status).toBe(401);
    });
});
