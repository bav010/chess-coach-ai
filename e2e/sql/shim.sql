-- заглушка Supabase: роли, схема auth, auth.uid() из настройки сеанса, публикация realtime
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated; grant usage on schema public to authenticated, anon;
create publication supabase_realtime;
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','a@x'), ('22222222-2222-2222-2222-222222222222','b@x'), ('33333333-3333-3333-3333-333333333333','c@x');
