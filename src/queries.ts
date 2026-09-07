import { pool } from "./db.js";

export type User = {
    id: string;
    email: string;
    timezone: string;
    created_at: Date;
};

export type Project = {
    id: string;
    name: string;
    created_at: Date;
};

export type Role = "lead" | "associate";


//Functions


// adds one person to the database and hands you back their record.
// This adds one row to the users table, and returns the whole row as a JavaScript object. The database generates the id and created_at values for you, so you don't have to.
export async function createUser(email: string, timezone: string): Promise<User> {

    //Query is a connections that sends one line, then closes the connection afterwards. It is the simplest way to run a query, and it is fine for one-off queries like this. If you need to run multiple queries in a row, you can borrow a connection from the pool and use it for all of them, then return it to the pool when you're done.
    const { rows } = await pool.query<User>(
        `
        insert into users (email, timezone)
        values ($1, $2)
        returning *
        `,
        [email, timezone]
    );
    return rows[0]

    /*
        The backtick string exists as text in memory. Nothing has happened.
        pool.query borrows a connection from the pool and sends the text and the values across it.
        Postgres — the separate program running in the background — parses it, generates the id, and writes the row into its own data files under C:\Program Files\PostgreSQL\18\data.
        await holds your function there until Postgres replies.
        Postgres sends back the finished row, because you asked for returning *.
        pg turns that reply into a JavaScript object and puts it in rows.
    */
}


// This function creates a new project and adds the user as its lead. It does two things in one transaction: it inserts a row into the projects table, and it inserts a row into the memberships table. If either insert fails, the other is rolled back.


export async function createProject(name: string, userId: string): Promise<Project> {
    //This opens a connection, and remains open until you call release. You can run multiple queries on it, and they will all be part of the same transaction.
    const client = await pool.connect();

    try {
        // This starts a transaction. All queries after this will be part of the same transaction, until you call commit or rollback.
        await client.query("begin");

        const { rows } = await client.query<Project>(
            `insert into projects (name)
            values ($1)
             returning *`,
            [name]
        );

        const project = rows[0];

        await client.query(
            `insert into memberships (user_id, project_id, role)
            values ($1, $2, 'lead')`,
            [userId, project.id]
        );

        await client.query("commit");
        return project;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}



export async function addMember(projectId: string, userId: string, role: Role):Promise<void> {
    await pool.query(
        `insert into memberships (user_id, project_id, role)
        values ($1, $2, $3)`,
        [userId, projectId, role]
    );
}



export async function removeMember(projectId: string, userId: string): Promise<void> {
    await pool.query(
        `update memberships
        set ended_at = now()
        where project_id = $1
        and user_id = $2
        and ended_at is null`,
        [projectId, userId]
    );
}



export async function listProjectsForUser(userId: string): Promise<Project[]> {
    const { rows } = await pool.query<Project>(
        `select p.*
        from projects p
        join memberships m on m.project_id = p.id
        where m.user_id = $1
        and m.ended_at is null
        order by p.created_at`,
        [userId]
    );
    return rows;
}