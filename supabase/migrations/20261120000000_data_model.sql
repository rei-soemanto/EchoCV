create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  date_of_birth date not null,
  status text not null check (status in ('student', 'fresh_graduate', 'employed', 'looking_for_work')),
  job_field text not null check (char_length(job_field) between 1 and 60),
  preferred_language text not null check (preferred_language in ('id', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  analysis boolean not null,
  model_training boolean not null default false,
  hr_rater_sharing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_field text not null check (char_length(job_field) between 1 and 60),
  role text not null check (char_length(role) between 1 and 80),
  level text not null check (level in ('internship', 'fresh_graduate', 'junior', 'mid_level')),
  language text not null check (language in ('id', 'en')),
  question_set text not null check (question_set in ('general', 'behavioral', 'role_specific')),
  mode text not null check (mode in ('live', 'upload')),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished', 'cancelled', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (id, user_id)
);

create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid(),
  position smallint not null check (position >= 0),
  question_id text not null,
  question_text text not null,
  created_at timestamptz not null default now(),
  unique (session_id, position),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.practice_sessions (id, user_id) on delete cascade
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  session_question_id uuid not null unique,
  user_id uuid not null default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'analyzed', 'skipped', 'failed')),
  visual_metrics jsonb,
  speech_metrics jsonb,
  transcript text,
  scores jsonb,
  content_status text not null default 'pending' check (content_status in ('pending', 'scored', 'not_scored')),
  rubric_version text,
  model_versions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_question_id, user_id) references public.session_questions (id, user_id) on delete cascade
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null,
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('audio', 'video')),
  bucket text not null check (bucket in ('answer-audio', 'answer-videos')),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'processing', 'processed', 'failed', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'audio' and bucket = 'answer-audio') or (kind = 'video' and bucket = 'answer-videos')),
  check (split_part(storage_path, '/', 1) = user_id::text),
  foreign key (answer_id, user_id) references public.answers (id, user_id) on delete cascade
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  user_id uuid not null default auth.uid(),
  overall_score numeric(5, 2) check (overall_score between 0 and 100),
  report jsonb not null,
  rubric_version text not null,
  model_versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.practice_sessions (id, user_id) on delete cascade
);

create index practice_sessions_user_created_idx on public.practice_sessions (user_id, created_at desc);
create index session_questions_user_idx on public.session_questions (user_id);
create index answers_user_idx on public.answers (user_id);
create index uploads_user_idx on public.uploads (user_id);
create index uploads_answer_idx on public.uploads (answer_id);
create index reports_user_idx on public.reports (user_id);

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger consents_set_updated_at before update on public.consents
  for each row execute function public.set_updated_at();
create trigger answers_set_updated_at before update on public.answers
  for each row execute function public.set_updated_at();
create trigger uploads_set_updated_at before update on public.uploads
  for each row execute function public.set_updated_at();
create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

create function public.require_adult_profile() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'profile owner must be 18 or older' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_require_adult before insert or update of date_of_birth on public.profiles
  for each row execute function public.require_adult_profile();

create function public.keep_session_settings() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mode is distinct from old.mode
    or new.language is distinct from old.language
    or new.user_id is distinct from old.user_id then
    raise exception 'session mode, language and owner cannot change' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger practice_sessions_keep_settings before update on public.practice_sessions
  for each row execute function public.keep_session_settings();

alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.session_questions enable row level security;
alter table public.answers enable row level security;
alter table public.uploads enable row level security;
alter table public.reports enable row level security;

create policy "Own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Own consents" on public.consents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own sessions" on public.practice_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own session questions" on public.session_questions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own answers" on public.answers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own uploads" on public.uploads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own reports" on public.reports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
