import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../passwords.js";


describe("passwords", () => {
    it("writes the settings it used into the stored string", async () => {
        //TEST
        const stored = await hashPassword("correct horse battery");

        expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    });

    it("accepts the password it was made from", async () => {
        //CREATE
        const stored = await hashPassword("correct horse battery");

        //TEST
        expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    });

    it("refuses any other password, even one letter off", async () => {
        //CREATE
        const stored = await hashPassword("correct horse battery");

        //TEST
        expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
        expect(await verifyPassword("", stored)).toBe(false);
    });

    it("salts every hash, so one password never gives the same string twice", async () => {
        //CREATE
        const first = await hashPassword("correct horse battery");
        const second = await hashPassword("correct horse battery");

        //TEST
        expect(first).not.toBe(second);
        expect(await verifyPassword("correct horse battery", second)).toBe(true);
    });

    it("checks a password with the settings stored beside it, not today's", async () => {
        //CREATE
        const older = await hashPassword("correct horse battery", { memory: 8192, passes: 1, parallelism: 1 });

        //TEST
        expect(older).toContain("$m=8192,t=1,p=1$");
        expect(await verifyPassword("correct horse battery", older)).toBe(true);
        expect(await verifyPassword("wrong horse battery", older)).toBe(false);
    });

    it("refuses to read a stored string that is not an Argon2id hash", async () => {
        //TEST
        await expect(verifyPassword("correct horse battery", "correct horse battery")).rejects.toMatchObject({
            message: "verifyPassword: the stored string is not an Argon2id hash",
        });
    });
});
