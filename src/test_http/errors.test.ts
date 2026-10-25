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
        expect(response.body).toEqual({ error: "Not found", code: "not-found" });
    });

    it("answers a body that is not JSON with 400, before asking who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Content-Type", "application/json")
            .send('{"name": "Shop');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "The request body is not valid JSON", code: "invalid-json" });
    });

    it("answers a body the rules refuse with 400, its code, and what was wrong", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Cookie", await cookieFor(ana))
            .send({ name: "" });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe("invalid-body");
        expect(response.body.issues[0].path).toEqual(["name"]);
    });

    it("answers a body over the size limit with 413", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .send({ name: "x".repeat(200000) });

        expect(response.status).toBe(413);
        expect(response.body).toEqual({ error: "The request body is too large", code: "body-too-large" });
    });

    it("answers a character set it cannot read with 415, not 500", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Content-Type", "application/json; charset=latin1")
            .send('{"name": "Shop"}');

        expect(response.status).toBe(415);
        expect(response.body).toEqual({ error: "The request cannot be read", code: "unreadable-request" });
    });

    it("answers a content encoding it cannot read with 415, not 500", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .set("Content-Type", "application/json")
            .set("Content-Encoding", "compress")
            .send('{"name": "Shop"}');

        expect(response.status).toBe(415);
        expect(response.body).toEqual({ error: "The request cannot be read", code: "unreadable-request" });
    });

    it("answers a path with an escape it cannot decode with 400, not 500", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/projects/%zz/tasks")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "The request cannot be read", code: "unreadable-request" });
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
        expect(response.body).toEqual({ error: "Something went wrong", code: "server-error" });
    });
});
