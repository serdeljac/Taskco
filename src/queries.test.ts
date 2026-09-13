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

        //Create a user and add it into the database (taskco_test)
        //The function is pulled form queries.ts
        const user = await createUser("someone@example.com", "Europe/Zagreb");

        //Compare values
        //The Rules in the .sql files fill in the id and created_at
        expect(user.email).toBe("someone@example.com");
        expect(user.timezone).toBe("Europe/Zagreb");
        expect(typeof user.id).toBe("string");
        expect(user.created_at).toBeInstanceOf(Date);
    });
});

describe("projects", () => {

    it("makes the creator a member of the project", async () => {
        //Create the user (note, not a lead/member of anything yet)
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        //Create a project, the function requests a user id to be it's lead
        const project = await createProject("Website", lead.id);
        const projects = await listProjectsForUser(lead.id);

        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe(project.id);
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
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        // Add the member again and expect the database to refuse it. The partial
        // unique index allows only one *active* membership per person per project.
        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "associate" })
        ).rejects.toMatchObject({ code: "23505" });
    });

    it("returns only the projects a user belongs to", async () => {
        const alice = await createUser("alice@example.com", "Europe/Zagreb");
        const bob = await createUser("bob@example.com", "Europe/Zagreb");

        const aliceProject = await createProject("Alice's work", alice.id);
        await createProject("Bob's work", bob.id);

        const projects = await listProjectsForUser(alice.id);

        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe(aliceProject.id);
    });

    it("stops listing a project once the member has left", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        expect(await listProjectsForUser(other.id)).toHaveLength(1);

        await removeMember({ projectId: project.id, userId: other.id });
        expect(await listProjectsForUser(other.id)).toHaveLength(0);
    });

    it("refuses a second lead on the same project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "lead" })
        ).rejects.toMatchObject({ code: "23505", constraint: "memberships_one_lead_idx", });
    });

    it("refuses to remove the project's lead", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            removeMember({ projectId: project.id, userId: lead.id })
        ).rejects.toMatchObject({ message: "Cannot remove the project's lead" });
    });

});

