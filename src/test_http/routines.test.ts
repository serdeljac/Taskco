import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { cookieFor } from "../testing/session.js";
import { pool } from "../db.js";
import { createUser, createRoutine, listRoutines, completeRoutine } from "../queries.js";


describe("GET /routines", () => {
    it("lists the asker's routines", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5] });

        //TEST
        const response = await request(app)
            .get("/routines")
            .set("Cookie", await cookieFor(ana));

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
            .set("Cookie", await cookieFor(cara));

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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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

describe("PUT /routines/:routineId/completions/today", () => {
    it("records today as done, on the owner's own calendar", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        const response = await request(app)
            .put(`/routines/${routine.id}/completions/today`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);
        expect(response.body.doneOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        const routines = await listRoutines(ana.id);
        expect(routines[0]?.done_today).toBe(true);
    });

    it("does nothing the second time", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await completeRoutine({ routineId: routine.id, userId: ana.id });

        //TEST
        const response = await request(app)
            .put(`/routines/${routine.id}/completions/today`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);

        const completions = await pool.query("select done_on from completions where routine_id = $1", [routine.id]);
        expect(completions.rows).toHaveLength(1);
    });

    it("answers 404 for someone else's routine", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        const response = await request(app)
            .put(`/routines/${routine.id}/completions/today`)
            .set("Cookie", await cookieFor(cara));

        expect(response.status).toBe(404);
        expect((await listRoutines(ana.id))[0]?.done_today).toBe(false);
    });

    it("answers 404 for a routine id that is not a number", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .put("/routines/abc/completions/today")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(404);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).put("/routines/1/completions/today");

        expect(response.status).toBe(401);
    });
});


describe("DELETE /routines/:routineId/completions/today", () => {
    it("takes back today's completion", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await completeRoutine({ routineId: routine.id, userId: ana.id });

        //TEST
        const response = await request(app)
            .delete(`/routines/${routine.id}/completions/today`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(204);
        expect((await listRoutines(ana.id))[0]?.done_today).toBe(false);
    });

    it("answers 409 when nothing was done today", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        const response = await request(app)
            .delete(`/routines/${routine.id}/completions/today`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "not completed today" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).delete("/routines/1/completions/today");

        expect(response.status).toBe(401);
    });
});


describe("GET /routines/:routineId/streak", () => {
    it("counts the streak, today included once it is done", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await completeRoutine({ routineId: routine.id, userId: ana.id });

        //TEST
        const response = await request(app)
            .get(`/routines/${routine.id}/streak`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ streak: 1 });
    });

    it("answers 404 for someone else's routine", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        const response = await request(app)
            .get(`/routines/${routine.id}/streak`)
            .set("Cookie", await cookieFor(cara));

        expect(response.status).toBe(404);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/routines/1/streak");

        expect(response.status).toBe(401);
    });
});
