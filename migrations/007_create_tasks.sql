create table tasks (
    id bigint generated always as identity primary key,
    project_id bigint not null references projects (id) on delete cascade,
    title text not null,
    created_at timestamptz not null default now(),
    constraint tasks_title_not_blank check (length(trim(title)) > 0)
);

create index tasks_project_id_idx on tasks (project_id);