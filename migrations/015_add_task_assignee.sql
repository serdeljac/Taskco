alter table memberships
    add constraint memberships_id_project_key unique (id, project_id);

alter table tasks
    add column assignee_membership_id bigint;

alter table tasks
    add constraint tasks_assignee_in_project
    foreign key (assignee_membership_id, project_id)
    references memberships (id, project_id)
    on delete set null (assignee_membership_id);

alter table subtasks
    add column assignee_membership_id bigint
    references memberships (id) on delete set null;

create or replace view visible_tasks as
    select * from tasks
    where deleted_at is null;

create or replace view visible_subtasks as
    select * from subtasks
    where deleted_at is null;