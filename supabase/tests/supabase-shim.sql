-- TEST-ONLY stand-in for the parts of Supabase that our migrations depend on.
--
-- A real Supabase project already has these roles, the auth schema, auth.users and auth.uid().
-- This file recreates just enough of them inside PGlite (Postgres compiled to WebAssembly) so the
-- real migration files can be applied and their security rules tested offline. It is never
-- applied to a real database.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Same contract as Supabase's auth.uid(): the JWT "sub" claim of the current request, as uuid.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants broad default privileges on new public objects to the API roles. Reproducing
-- that here proves our migrations revoke them correctly rather than relying on a locked-down default.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
