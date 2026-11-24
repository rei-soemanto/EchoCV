delete from public.scoring_bands
  where dimension in ('clarity_mixing', 'eye_contact', 'fillers', 'pace', 'pauses', 'posture', 'smile', 'voice')
  and (dimension, language) not in (('eye_contact', 'any'), ('smile', 'any'), ('posture', 'any'), ('fillers', 'any'), ('pace', 'en'), ('pace', 'id'), ('pauses', 'any'), ('voice', 'any'), ('clarity_mixing', 'en'));

insert into public.scoring_bands (dimension, language, metric, ideal_low, ideal_high, zero_low, zero_high, version, provisional, note) values
  ('eye_contact', 'any', 'eye_contact_pct', 89.54, 100.0, 10.585, 100.0, '0.2.0', true, 'Share of answer frames with eye contact. Team-calibrated on the EchoCV team recordings, every person weighted equally; 5 people, 44 answers. Full marks from the team median, 0 at the staged looking-away clips. Not yet rated by HR practitioners.'),
  ('smile', 'any', 'smile_pct', 26.14, 100.0, 0.0, 100.0, '0.2.0', true, 'Feedback only: smile has weight 0 in shared/rubric.json (BR-09). Full marks at the staged smile clips. Not yet rated by HR practitioners.'),
  ('posture', 'any', 'behaviour_pct', 0.0, 1.215, 0.0, 82.885, '0.2.0', true, 'Share of answer time with touching face, arms crossed, slouching or reading notes. Team-calibrated on the EchoCV team recordings, every person weighted equally; 5 people, 44 answers. Full marks up to the team median, 0 at the staged behaviour clips. Not yet rated by HR practitioners.'),
  ('fillers', 'any', 'fillers_per_minute', 0.0, 1.3272, 0.0, 19.1767, '0.2.0', true, 'Vocal and lexical fillers per minute of answer audio. Team-calibrated on the EchoCV team recordings, every person weighted equally; 5 people, 44 answers. full marks up to the team median, 0 at 2 times the worst answer. One band for both languages until the Indonesian filler model is measured on real speech. Not yet rated by HR practitioners.'),
  ('pace', 'en', 'pace_deviation', 0.0, 0.0, 0.0, 0.2071, '0.2.0', true, 'Distance outside this language''s syllablesPerSecond band in shared/thresholds.json, as a fraction of its median; 0 at one band width outside the band. Team-calibrated on the EchoCV team recordings, every person weighted equally; 18 answers. Not yet rated by HR practitioners.'),
  ('pace', 'id', 'pace_deviation', 0.0, 0.0, 0.0, 0.2657, '0.2.0', true, 'Distance outside this language''s syllablesPerSecond band in shared/thresholds.json, as a fraction of its median; 0 at one band width outside the band. Team-calibrated on the EchoCV team recordings, every person weighted equally; 26 answers. Not yet rated by HR practitioners.'),
  ('pauses', 'any', 'long_pauses_per_minute', 0.0, 0.0, 0.0, 3.7879, '0.2.0', true, 'Pauses of at least longPauseMs per minute of answer audio. Team-calibrated on the EchoCV team recordings, every person weighted equally; 5 people, 44 answers. full marks up to the team median, 0 at 2 times the worst answer. Not yet rated by HR practitioners.'),
  ('voice', 'any', 'pitch_variation', 0.2013, 10.0, 0.0128, 10.0, '0.2.0', true, 'Pitch variation as pitchStdHz / pitchMeanHz, so higher and lower voices are judged alike; more variation is never penalised. Team-calibrated on the EchoCV team recordings, every person weighted equally; 5 people, 44 answers. Full marks from the team median, the least varied answer at 50. Volume is not scored because it depends on the microphone. Not yet rated by HR practitioners.'),
  ('clarity_mixing', 'en', 'mixed_word_pct', 0.0, 0.0, 0.0, 11.5942, '0.2.0', true, 'English sessions only: share of words spoken in Indonesian caps the clarity part of content (BR-27, BR-28). Team-calibrated on the EchoCV team recordings, every person weighted equally; 18 English answers; full marks up to the team median, 0 at 2 times the worst answer. Not yet rated by HR practitioners.')
on conflict (dimension, language) do update set
  metric = excluded.metric,
  ideal_low = excluded.ideal_low,
  ideal_high = excluded.ideal_high,
  zero_low = excluded.zero_low,
  zero_high = excluded.zero_high,
  version = excluded.version,
  provisional = excluded.provisional,
  note = excluded.note;
