create table memberships (
    id bigint generated always as identity primary key,
    user_id bigint not null references users (id) on delete cascade,
    project_id bigint not null references projects (id) on delete cascade,
    role text not null check (role in ('lead', 'associate')),
    created_at timestamptz not null default now(),
    ended_at timestamptz
);

create index memberships_user_id_idx on memberships (user_id);

create unique index memberships_one_active_idx
    on memberships (user_id, project_id)
    where ended_at is null;


/*
references users (id) is the foreign key. It means the database will reject any membership whose user_id doesn't match a real user — and will refuse to delete a user while memberships point at them, unless you say what should happen instead. Which is the next part.

The column type has to match what it points at, which is why these are bigint.

on delete cascade answers "what happens to the children when the parent goes." Here: delete a user for real, and their memberships go with them. That's correct because a membership is meaningless without both sides.

Note this only concerns hard deletion — which in your design only happens when delete mode expires after 30 days. Soft deletion is ended_at, and the database has no idea that column means anything.

check (role in ('lead', 'associate')) rejects any other value at write time. This is your role decision made real: as strict as an enum, and changing the list later is one ordinary migration.

ended_at timestamptz with no not null. The null is carrying meaning here — it's the difference between "this membership hasn't ended" and "it ended on this date." That's the same evaluated versus not evaluated distinction your design doc makes about priority.

create index memberships_user_id_idx is what makes "what projects am I in" fast. Without it Postgres reads every row in the table to find one user's memberships. The primary key already indexes id, which isn't the column you search by.

The partial unique index is the one worth actually understanding:

    on memberships (user_id, project_id)
    where ended_at is null

An index is a structure holding an entry per row. A partial index holds entries only for rows matching its where clause. A unique index rejects duplicate entries within itself.

Put those together: rows where ended_at is set aren't in this index at all, so they can duplicate as much as they like. Rows where it's null are, so a second active membership for the same person and project is impossible to write.

That's how "one active membership" becomes a thing the database enforces rather than a rule you have to remember — while the ended rows still accumulate as the history the Lead re-invites from.

Index names. Postgres will invent one if you don't supply it, but explicit names show up in constraint-violation errors and in any migration that alters them later. table_column_idx is the usual convention.
*/