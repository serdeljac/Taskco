alter table memberships
    add constraint memberships_ended_after_created
    check (ended_at >= created_at);

alter table tasks
    add constraint tasks_deleted_after_created
    check (deleted_at >= created_at);

alter table subtasks
    add constraint subtasks_deleted_after_created
    check (deleted_at >= created_at);