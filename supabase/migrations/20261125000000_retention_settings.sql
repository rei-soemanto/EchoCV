create table public.retention_settings (
  key text primary key,
  value numeric not null check (value > 0),
  note text not null default '',
  updated_at timestamptz not null default now()
);

create trigger retention_settings_set_updated_at before update on public.retention_settings
  for each row execute function public.set_updated_at();

alter table public.retention_settings enable row level security;

create policy "Read retention settings" on public.retention_settings for select to authenticated using (true);

insert into public.retention_settings (key, value, note) values
  ('leftover_media_hours', 24, 'Answer audio or video still in storage this many hours after upload is deleted automatically, unless it is analysed audio the user agreed to keep for training or HR raters (BR-05).');
