create table public.dayflow_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  saved_routes jsonb not null default '[]'::jsonb,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint dayflow_items_are_array check (jsonb_typeof(items) = 'array'),
  constraint dayflow_saved_routes_are_array check (jsonb_typeof(saved_routes) = 'array'),
  constraint dayflow_schema_version_positive check (schema_version > 0)
);

comment on table public.dayflow_user_state is
  'One private DAYFLOW calendar, expense, and saved-route snapshot per authenticated user.';

alter table public.dayflow_user_state enable row level security;

revoke all on table public.dayflow_user_state from anon, authenticated;
grant select, insert, update, delete on table public.dayflow_user_state to authenticated;

create policy "dayflow users can read their own state"
on public.dayflow_user_state
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "dayflow users can create their own state"
on public.dayflow_user_state
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "dayflow users can update their own state"
on public.dayflow_user_state
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "dayflow users can delete their own state"
on public.dayflow_user_state
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
