import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { cookieFor } from "../testing/session.js";
import { createUser, registerUser, createProject, listProjectsForUser, getUser } from "../queries.js";


//A browser marks every request with where it was started, in Sec-Fetch-Site. Taskco's own pages send same-origin
describe("a request started on another site", () => {
    it("refuses a write marked cross-site, and changes nothing", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Cookie", await cookieFor(ana))
            .set("Sec-Fetch-Site", "cross-site")
            .send({ name: "Shop" });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "This request came from another site" });
        expect(await listProjectsForUser(ana.id)).toHaveLength(0);
    });

    it("refuses a write with no body marked same-site, which SameSite alone would let through", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/account/deletion")
            .set("Cookie", await cookieFor(ana))
            .set("Sec-Fetch-Site", "same-site");

        expect(response.status).toBe(403);
        expect((await getUser(ana.id)).deletion_scheduled_at).toBeNull();
    });

    it("refuses a login marked cross-site", async () => {
        //CREATE
        await registerUser({ email: "ana@example.com", password: "correct horse battery", timezone: "Europe/Zagreb" });

        //TEST
        const response = await request(app)
            .post("/sessions")
            .set("Sec-Fetch-Site", "cross-site")
            .send({ email: "ana@example.com", password: "correct horse battery" });

        expect(response.status).toBe(403);
        expect(response.get("Set-Cookie")).toBeUndefined();
    });

    it("lets a write marked same-origin through", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Cookie", await cookieFor(ana))
            .set("Sec-Fetch-Site", "same-origin")
            .send({ name: "Shop" });

        expect(response.status).toBe(201);
    });

    it("does not refuse a read marked cross-site", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", await cookieFor(ana))
            .set("Sec-Fetch-Site", "cross-site");

        expect(response.status).toBe(200);
    });
});
