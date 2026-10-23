alter table users
    add column password_hash text;

alter table users
    add constraint users_password_hash_is_argon2id
    check (password_hash like '$argon2id$%');
