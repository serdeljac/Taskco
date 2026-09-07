import { describe, it, expect } from "vitest";
import { pool } from "./db.js";
import {
    createUser,
    createProject,
    addMember,
    removeMember,
    listProjectsForUser,
} from "./queries.js";

describe("users", () => {
    it("returns a row the database generated", async () => {
        const user = await createUser("someone@example.com", "Europe/Zagreb");

        expect(user.email).toBe("someone@example.com");
        expect(user.timezone).toBe("Europe/Zagreb");
        expect(typeof user.id).toBe("string");
        expect(user.created_at).toBeInstanceOf(Date);
    });
});

describe("projects", () => {
    it("makes the creator a member of the project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const projects = await listProjectsForUser(lead.id);

        expect(projects).toHaveLength(1);
        expect(projects[0].id).toBe(project.id);
    });

    it("gives the creator the lead role, not associate", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const { rows } = await pool.query(
            "select role from memberships where project_id = $1 and user_id = $2",
            [project.id, lead.id]
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].role).toBe("lead");
    });

    it("refuses a project with a blank name", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");

        await expect(createProject("   ", lead.id)).rejects.toMatchObject({
            code: "23514",
        });
    });

    it("refuses two users with the same email in different cases", async () => {
        await createUser("Person@example.com", "Europe/Zagreb");

        await expect(
            createUser("person@example.com", "Europe/Zagreb")
        ).rejects.toMatchObject({ code: "23505" });
    });
});

describe("memberships", () => {
    it("refuses to add the same person to a project twice", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //Add the member
        await addMember(project.id, other.id, "associate");

        // Add the member again and expect the database to refuse it. The partial
        // unique index allows only one *active* membership per person per project.
        await expect(
            addMember(project.id, other.id, "associate")
        ).rejects.toMatchObject({ code: "23505" });
    });

    it("returns only the projects a user belongs to", async () => {
        const alice = await createUser("alice@example.com", "Europe/Zagreb");
        const bob = await createUser("bob@example.com", "Europe/Zagreb");

        const aliceProject = await createProject("Alice's work", alice.id);
        await createProject("Bob's work", bob.id);

        const projects = await listProjectsForUser(alice.id);

        expect(projects).toHaveLength(1);
        expect(projects[0].id).toBe(aliceProject.id);
    });

    it("stops listing a project once the member has left", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await addMember(project.id, other.id, "associate");
        expect(await listProjectsForUser(other.id)).toHaveLength(1);

        await removeMember(project.id, other.id);
        expect(await listProjectsForUser(other.id)).toHaveLength(0);
    });
});

