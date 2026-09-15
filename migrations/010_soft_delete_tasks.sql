alter table tasks
    add column deleted_at timestamptz;

create view visible_tasks as
    select * from tasks
    where deleted_at is null;