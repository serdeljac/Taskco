create function is_known_timezone(tz text) returns boolean
language sql stable
return exists (select 1 from pg_timezone_names where name = tz);

alter table users
    add constraint users_timezone_known
    check (is_known_timezone(timezone));

alter table memberships
    add constraint memberships_ended_not_in_future
    check (ended_at <= now());

alter table tasks
    add constraint tasks_deleted_not_in_future
    check (deleted_at <= now());

alter table subtasks
    add constraint subtasks_deleted_not_in_future
    check (deleted_at <= now());