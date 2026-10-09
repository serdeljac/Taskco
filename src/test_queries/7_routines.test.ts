import { describe, it, expect } from "vitest";
import { pool } from "../db.js";

import {
    createUser,
    createRoutine,
    listRoutines,
    completeRoutine,
    undoCompletion,
    deleteAccount,
    purgeDeletedAccounts,
    getStreak,
} from "../queries.js";

describe("routines", () => {
    it("creates a routine for the person who owns it", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5] });
        const routines = await listRoutines(ana.id);

        expect(routines.map((r) => r.name)).toEqual(["Stretch"]);
        expect(routines[0]?.weekdays).toEqual([1, 2, 3, 4, 5]);
    });

    it("refuses a routine with no days", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        await expect(
            createRoutine({ userId: ana.id, name: "Stretch", weekdays: [] })
        ).rejects.toMatchObject({ code: "23514", constraint: "routines_weekdays_valid" });
    });

    it("refuses a day that is not 1 to 7", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        await expect(
            createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 8] })
        ).rejects.toMatchObject({ code: "23514", constraint: "routines_weekdays_valid" });
    });

    it("says whether a routine is due today", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const { rows } = await pool.query<{ day: number }>(
            `select extract(isodow from today)::int as day from user_today where user_id = $1`,
            [ana.id]
        );
        const today = rows[0]?.day ?? 0;
        const otherDays = [1, 2, 3, 4, 5, 6, 7].filter((day) => day !== today);

        //TEST
        await createRoutine({ userId: ana.id, name: "Every day", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await createRoutine({ userId: ana.id, name: "Not today", weekdays: otherDays });
        const routines = await listRoutines(ana.id);

        expect(routines.map((r) => [r.name, r.due_today])).toEqual([
            ["Every day", true],
            ["Not today", false],
        ]);
    });

    it("marks a routine done today, once however many times it is completed", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        await completeRoutine({ routineId: routine.id, userId: ana.id });
        await completeRoutine({ routineId: routine.id, userId: ana.id });

        const completions = await pool.query(`select done_on from completions where routine_id = $1`, [routine.id]);
        const [listed] = await listRoutines(ana.id);

        expect(completions.rowCount).toBe(1);
        expect(listed?.done_today).toBe(true);
    });

    it("dates a completion by the owner's calendar, not the server's", async () => {
        //CREATE
        const early = await createUser("early@example.com", "Pacific/Kiritimati");
        const late = await createUser("late@example.com", "Pacific/Pago_Pago");
        const first = await createRoutine({ userId: early.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        const second = await createRoutine({ userId: late.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        const a = await completeRoutine({ routineId: first.id, userId: early.id });
        const b = await completeRoutine({ routineId: second.id, userId: late.id });

        expect(a.doneOn).not.toBe(b.doneOn);
    });

    it("keeps one person's routines from another", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const bruno = await createUser("bruno@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        await expect(
            completeRoutine({ routineId: routine.id, userId: bruno.id })
        ).rejects.toMatchObject({ message: "completeRoutine: routine not found" });

        expect(await listRoutines(bruno.id)).toEqual([]);
    });

    it("undoes today's completion", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await completeRoutine({ routineId: routine.id, userId: ana.id });

        //TEST
        await undoCompletion({ routineId: routine.id, userId: ana.id });
        const [listed] = await listRoutines(ana.id);

        expect(listed?.done_today).toBe(false);
    });

    it("purges an account's routines and completions with it", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await completeRoutine({ routineId: routine.id, userId: ana.id });

        //TEST
        await deleteAccount(ana.id);
        await pool.query(`update users set deletion_scheduled_at = now() - interval '1 day'`);
        await purgeDeletedAccounts();

        const routines = await pool.query(`select id from routines`);
        const completions = await pool.query(`select routine_id from completions`);

        expect(routines.rowCount).toBe(0);
        expect(completions.rowCount).toBe(0);
    });

    it("counts a streak from the owner's own today", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });
        await pool.query(`update routines set created_at = now() - interval '10 days' where id = $1`, [routine.id]);
        for (const daysAgo of [1, 2]) {
            await pool.query(
                `insert into completions (routine_id, done_on)
                select $1, today - $3::int from user_today where user_id = $2`,
                [routine.id, ana.id, daysAgo]
            );
        }

        //TEST
        expect(await getStreak({ routineId: routine.id, userId: ana.id })).toBe(2);
        await completeRoutine({ routineId: routine.id, userId: ana.id });
        expect(await getStreak({ routineId: routine.id, userId: ana.id })).toBe(3);
    });

    it("keeps one person's streak from another", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const bruno = await createUser("bruno@example.com", "Europe/Zagreb");
        const routine = await createRoutine({ userId: ana.id, name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7] });

        //TEST
        await expect(
            getStreak({ routineId: routine.id, userId: bruno.id })
        ).rejects.toMatchObject({ message: "getStreak: routine not found" });
    });
});