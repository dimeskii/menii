create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),

  section text not null,        
  category text not null,
         
  name text not null,
  price integer not null,
  description text,
  image text,

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Keeps items in a predictable, editable order.
create index if not exists menu_items_section_category_order_idx
  on public.menu_items (section, category, sort_order);

-- Enable Row Level Security.
alter table public.menu_items enable row level security;

-- Public website: anyone can read menu items.
drop policy if exists "Anyone can read menu items"
  on public.menu_items;

create policy "Anyone can read menu items"
  on public.menu_items
  for select
  to anon, authenticated
  using (true);

-- Admin: signed-in users can insert, update, and delete menu items.
drop policy if exists "Authenticated users can manage menu items"
  on public.menu_items;

create policy "Authenticated users can manage menu items"
  on public.menu_items
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);