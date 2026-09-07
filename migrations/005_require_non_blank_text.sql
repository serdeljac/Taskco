alter table projects
    add constraint projects_name_not_blank
    check (length(trim(name)) > 0);

alter table users
    add constraint users_email_not_blank
    check (length(trim(email)) > 0),
    add constraint users_timezone_not_blank
    check (length(trim(timezone)) > 0);