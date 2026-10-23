import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { app, handleErrors } from "../app.js";
import { createUser } from "../queries.js";
import { cookieFor } from "../testing/session.js";


describe("errors", () => {
    it("answers a path that does not exist with JSON", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/nowhere")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("answers a body that is not JSON with 400, before asking who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Content-Type", "application/json")
            .send('{"name": "Shop');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "The request body is not valid JSON" });
    });

    it("answers a body over the size limit with 413", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .send({ name: "x".repeat(200000) });

        expect(response.status).toBe(413);
        expect(response.body).toEqual({ error: "The request body is too large" });
    });

    it("answers a crash with 500, and none of its details", async () => {
        //CREATE
        //A one-route app that crashes, ending with the real error handler, the way app.ts ends
        const crashing = express();
        crashing.get("/crash", () => {
            throw new Error("connection to taskco_dev refused at 10.0.0.5");
        });
        crashing.use(handleErrors);

        //TEST
        const response = await request(crashing).get("/crash");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Something went wrong" });
    });
});
