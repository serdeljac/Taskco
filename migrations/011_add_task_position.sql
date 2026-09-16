alter table tasks
    add column position integer not null default 0;

alter table tasks
    alter column position drop default;

create or replace view visible_tasks as
    select * from tasks
    where deleted_at is null;