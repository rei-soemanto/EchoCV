create table public.scoring_bands (
  dimension text not null,
  language text not null default 'any' check (language in ('any', 'id', 'en')),
  metric text not null,
  ideal_low numeric not null,
  ideal_high numeric not null,
  zero_low numeric not null,
  zero_high numeric not null,
  version text not null,
  provisional boolean not null default true,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (dimension, language),
  check (zero_low <= ideal_low and ideal_low <= ideal_high and ideal_high <= zero_high)
);

create trigger scoring_bands_set_updated_at before update on public.scoring_bands
  for each row execute function public.set_updated_at();

alter table public.scoring_bands enable row level security;

create policy "Read scoring bands" on public.scoring_bands for select to authenticated using (true);

insert into public.scoring_bands (dimension, language, metric, ideal_low, ideal_high, zero_low, zero_high, version, note) values
  ('eye_contact', 'any', 'eye_contact_pct', 60, 100, 10, 100, '0.1.0', 'Share of answer frames with eye contact. Starting guess until calibrated against HR ratings.'),
  ('smile', 'any', 'smile_pct', 10, 100, 0, 100, '0.1.0', 'Feedback only: smile has weight 0 in shared/rubric.json (BR-09).'),
  ('posture', 'any', 'behaviour_pct', 0, 5, 0, 50, '0.1.0', 'Share of answer time with touching face, arms crossed, slouching or reading notes.'),
  ('fillers', 'any', 'fillers_per_minute', 0, 3, 0, 12, '0.1.0', 'Vocal and lexical fillers per minute of answer audio.'),
  ('pace', 'any', 'pace_deviation', 0, 0, 0, 0.35, '0.1.0', 'Distance outside the language''s syllablesPerSecond band in shared/thresholds.json, as a fraction of its median.'),
  ('pauses', 'any', 'long_pauses_per_minute', 0, 1, 0, 6, '0.1.0', 'Pauses of at least longPauseMs per minute of answer audio.'),
  ('voice', 'any', 'pitch_std_hz', 15, 60, 5, 120, '0.1.0', 'Pitch variation: too flat or too jumpy both score lower. Volume is not scored because it depends on the microphone.'),
  ('clarity_mixing', 'en', 'mixed_word_pct', 0, 5, 0, 40, '0.1.0', 'English sessions only: share of words spoken in Indonesian caps the clarity part of content (BR-27, BR-28).');
