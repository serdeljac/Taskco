alter table users
    add column email text not null,
    add column timezone text not null;




create unique index users_email_lower_idx on users (lower(email));

/*
    alter table, not create table. Migrations modify what's already there. users exists with id and created_at; this adds to it. Going back to edit 001 would be the forward-only rule broken.

    not null works here only because the table is empty. If users already had rows, Postgres would refuse — it can't add a required column to rows that don't have a value for it. The standard pattern then is three steps: add the column nullable, fill in values, then add the constraint. Worth knowing now, because you'll hit it the first time you change a table that has data in it.

    create unique index ... on users (lower(email)) is a functional index — it indexes the result of calling lower() on each row, rather than the column itself. Two consequences, and both are the point:

    Uniqueness applies to the lowercased value, so Stjepan@x.com and stjepan@x.com collide. The database enforces it; no query can forget.
    A lookup written as where lower(email) = lower($1) can use this index instead of scanning the table.
*/