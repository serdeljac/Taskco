import { describe, it, expect } from "vitest";
import { isTestDatabase } from "./guard.js";

describe("isTestDatabase", () => {
    it("accepts a database named taskco_test", () => {
        expect(isTestDatabase("postgresql://taskco_app:pw@localhost:5432/taskco_test")).toBe(true);
    });

    it("refuses a database named taskco_dev", () => {
        expect(isTestDatabase("postgresql://taskco_app:pw@localhost:5432/taskco_dev")).toBe(false);
    });

    it("refuses taskco_dev even when the address ends in _test", () => {
        expect(
            isTestDatabase("postgresql://taskco_app:pw@localhost:5432/taskco_dev?application_name=_test")
        ).toBe(false);
    });
});