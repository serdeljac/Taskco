import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import {
    createUser,
    createProject,
    listProjectsForUser,
    deleteProject,
    addMember,
    restoreProject,
    createTask,
    createSubtask,
    deleteProjectNow,
} from "../queries.js";


describe("projects", () => {
    it("makes the creator a member of the project", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        const projects = await listProjectsForUser(lead.id);
        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe(project.id);
    });

    it("gives the creator the lead role, not associate", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        const { rows } = await pool.query(
            "select role from memberships where project_id = $1 and user_id = $2",
            [project.id, lead.id]
        );
        
        expect(rows).toHaveLength(1);
        expect(rows[0].role).toBe("lead");
    });

    it("refuses a project with a blank name", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");

        //TEST
        await expect(createProject("   ", lead.id)).rejects.toMatchObject({
            code: "23514",
        });
    });

    it("schedules a deleted project thirty days out", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        const { scheduledFor } = await deleteProject(project.id);
        const days = (scheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThan(30.1);
    });

    it("hides a project being deleted from an associate", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
        await deleteProject(project.id);
        expect(await listProjectsForUser(other.id)).toEqual([]);
    });

    it("still shows a project being deleted to its Lead, with the date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        const projects = await listProjectsForUser(lead.id);
        expect(projects.map((p) => p.id)).toEqual([project.id]);
        expect(projects[0]?.deletion_scheduled_at).not.toBeNull();
    });

    it("gives a restored project back to everyone", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
        await deleteProject(project.id);
        await restoreProject(project.id);
        const forOther = await listProjectsForUser(other.id);
        expect(forOther.map((p) => p.id)).toEqual([project.id]);
        expect(forOther[0]?.deletion_scheduled_at).toBeNull();
    });

    it("refuses to delete a project that is already being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        await expect(deleteProject(project.id)).rejects.toMatchObject({
            message: "deleteProject: project not found, or already being deleted",
        });
    });

    it("removes the project and everything under it when deleted now", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await deleteProjectNow(project.id);

        const projects = await pool.query(`select id from projects where id = $1`, [project.id]);
        const tasks = await pool.query(`select id from tasks where project_id = $1`, [project.id]);
        const subtasks = await pool.query(`select id from subtasks where task_id = $1`, [task.id]);

        expect(projects.rowCount).toBe(0);
        expect(tasks.rowCount).toBe(0);
        expect(subtasks.rowCount).toBe(0);
    });

    it("hides a project past its deletion date from its Lead", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        await pool.query(
            `update projects
            set deletion_scheduled_at = now() - interval '1 day'
            where id = $1`,
            [project.id]
        );

        expect(await listProjectsForUser(lead.id)).toEqual([]);
    });

    it("refuses to restore a project past its deletion date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        await pool.query(
            `update projects
            set deletion_scheduled_at = now() - interval '1 day'
            where id = $1`,
            [project.id]
        );

        await expect(restoreProject(project.id)).rejects.toMatchObject({
            message: "restoreProject: project not found, not inside its deletion window, or its Lead's account is being deleted",
        });

        const { rows } = await pool.query<{ deletion_scheduled_at: Date | null }>(
            `select deletion_scheduled_at from projects where id = $1`,
            [project.id]
        );

        expect(rows[0]?.deletion_scheduled_at).not.toBeNull();
    });

});