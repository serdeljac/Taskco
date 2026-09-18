alter table tasks
    add column notes text;

alter table subtasks
    add column notes text;

alter table tasks
    add constraint tasks_notes_not_blank
    check (length(trim(notes)) > 0);

alter table subtasks
    add constraint subtasks_notes_not_blank
    check (length(trim(notes)) > 0);

create or replace view visible_tasks as
    select * from tasks
    where deleted_at is null;

create or replace view visible_subtasks as
    select * from subtasks
    where deleted_at is null;