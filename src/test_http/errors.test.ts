import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";


describe("errors", () => {
    it("answers a path that does not exist with JSON", async () => {
        //TEST
        const response = await request(app)
            .get("/nowhere")
            .set("X-User-Id", "1");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("answers a body that is not JSON with 400", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("X-User-Id", "1")
            .set("Content-Type", "application/json")
            .send('{"name": "Shop');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "The request body is not valid JSON" });
    });

    it("answers a body over the size limit with 413", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("X-User-Id", "1")
            .send({ name: "x".repeat(200000) });

        expect(response.status).toBe(413);
        expect(response.body).toEqual({ error: "The request body is too large" });
    });

    it("answers a crash with 500, and no details", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("X-User-Id", "99")
            .send({ name: "Shop" });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Something went wrong" });
    });
});