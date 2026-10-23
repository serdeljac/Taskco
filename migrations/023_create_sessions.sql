create table sessions (
    token_hash text primary key,
    user_id bigint not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    constraint sessions_token_is_hashed check (token_hash ~ '^[0-9a-f]{64}$'),
    constraint sessions_expire_after_created check (expires_at > created_at)
);

create index sessions_user_id_idx on sessions (user_id);
