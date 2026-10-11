import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createRoutine, listRoutines } from "../queries.js";


describe("GET /routines", () => {
    it("lists the asker's routines", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5] });

        //TEST
        const response = await request(app)
            .get("/routines")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(200);
        expect(response.body.routines).toHaveLength(1);
        expect(response.body.routines[0].name).toBe("Stretch");
    });

    it("shows nobody else's routines", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5] });

        //TEST
        const response = await request(app)
            .get("/routines")
            .set("X-User-Id", cara.id);

        expect(response.status).toBe(200);
        expect(response.body.routines).toHaveLength(0);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/routines");

        expect(response.status).toBe(401);
    });
});

describe("POST /routines", () => {
    it("creates a routine in the asker's list", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/routines")
            .set("X-User-Id", ana.id)
            .send({ name: "Stretch", weekdays: [1, 2, 3, 4, 5] });

        expect(response.status).toBe(201);
        expect(response.body.routine.name).toBe("Stretch");
        expect(response.body.routine.weekdays).toEqual([1, 2, 3, 4, 5]);

        const routines = await listRoutines(ana.id);
        expect(routines[0]?.name).toBe("Stretch");
    });

    it("refuses a blank name", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/routines")
            .set("X-User-Id", ana.id)
            .send({ name: "   ", weekdays: [1, 2, 3, 4, 5] });

        expect(response.status).toBe(400);
        expect(await listRoutines(ana.id)).toHaveLength(0);
    });

    it("refuses a day that is not 1 to 7", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/routines")
            .set("X-User-Id", ana.id)
            .send({ name: "Stretch", weekdays: [1, 8] });

        expect(response.status).toBe(400);
        expect(await listRoutines(ana.id)).toHaveLength(0);
    });

    it("refuses a routine with no days", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/routines")
            .set("X-User-Id", ana.id)
            .send({ name: "Stretch", weekdays: [] });

        expect(response.status).toBe(400);
        expect(await listRoutines(ana.id)).toHaveLength(0);
    });

    it("refuses a body with a field it did not ask for", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/routines")
            .set("X-User-Id", ana.id)
            .send({ name: "Stretch", weekdays: [1, 2, 3, 4, 5], userId: "2" });

        expect(response.status).toBe(400);
        expect(await listRoutines(ana.id)).toHaveLength(0);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/routines")
            .send({ name: "Stretch", weekdays: [1, 2, 3, 4, 5] });

        expect(response.status).toBe(401);
    });
});