alter table tasks
    add column status text not null default 'not_started',
    add column priority text,
    add constraint tasks_status_valid
        check (status in ('not_started', 'in_progress', 'on_hold', 'completed')),
    add constraint tasks_priority_valid
        check (priority in ('low', 'med', 'high'));