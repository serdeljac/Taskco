import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createRoutine } from "../queries.js";


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