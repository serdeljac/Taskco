create table subtasks (
    id bigint generated always as identity primary key,
    task_id bigint not null references tasks (id) on delete cascade,
    title text not null,
    status text not null default 'not_started',
    priority text,
    due_date date,
    position integer not null,
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    constraint subtasks_title_not_blank
        check (length(trim(title)) > 0),
    constraint subtasks_status_valid
        check (status in ('not_started', 'in_progress', 'on_hold', 'completed')),
    constraint subtasks_priority_valid
        check (priority in ('low', 'med', 'high'))
);

create index subtasks_task_id_idx on subtasks (task_id);

create view visible_subtasks as
    select * from subtasks
    where deleted_at is null;