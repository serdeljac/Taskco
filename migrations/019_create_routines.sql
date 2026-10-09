create table routines (
    id bigint generated always as identity primary key,
    user_id bigint not null references users (id) on delete cascade,
    name text not null,
    weekdays integer[] not null,
    created_at timestamptz not null default now(),
    constraint routines_name_not_blank check (length(trim(name)) > 0),
    constraint routines_weekdays_valid
        check (cardinality(weekdays) > 0 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7])
);

create index routines_user_id_idx on routines (user_id);

create table completions (
    routine_id bigint not null references routines (id) on delete cascade,
    done_on date not null,
    created_at timestamptz not null default now(),
    primary key (routine_id, done_on)
);

create view user_today as
    select id as user_id, (now() at time zone timezone)::date as today
    from users;