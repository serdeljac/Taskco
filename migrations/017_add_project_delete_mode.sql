alter table projects
    add column deletion_scheduled_at timestamptz;

create or replace view visible_tasks as
    select t.*
    from tasks t
    join projects p on p.id = t.project_id
    where t.deleted_at is null
    and p.deletion_scheduled_at is null;

create or replace view visible_subtasks as
    select s.*
    from subtasks s
    join tasks t on t.id = s.task_id
    join projects p on p.id = t.project_id
    where s.deleted_at is null
    and p.deletion_scheduled_at is null;