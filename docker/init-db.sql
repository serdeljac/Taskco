\getenv app_password TASKCO_APP_PASSWORD

create role taskco_app login password :'app_password';

create database taskco_dev owner taskco_app;
create database taskco_test owner taskco_app;