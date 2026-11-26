alter table public.readings add column if not exists source text not null default 'sensor';

create table if not exists public.control (
  id         int primary key,
  manual     boolean not null default false,
  level      double precision not null default 50,
  updated_at timestamptz default now()
);
insert into public.control (id) values (1) on conflict do nothing;
alter table public.control enable row level security;
