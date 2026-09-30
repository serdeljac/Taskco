create table invites (
    id bigint generated always as identity primary key,
    project_id bigint not null references projects (id) on delete cascade,
    email text not null,
    invited_by_user_id bigint not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    constraint invites_email_not_blank check (length(trim(email)) > 0),
    constraint invites_expires_after_created check (expires_at > created_at)
);

create unique index invites_one_per_project_email_idx
    on invites (project_id, lower(email));