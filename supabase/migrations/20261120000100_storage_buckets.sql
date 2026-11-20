insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('answer-audio', 'answer-audio', false, 52428800, array['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4']),
  ('answer-videos', 'answer-videos', false, 524288000, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Own answer files read" on storage.objects for select to authenticated
  using (bucket_id in ('answer-audio', 'answer-videos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own answer files upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('answer-audio', 'answer-videos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own answer files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('answer-audio', 'answer-videos') and (storage.foldername(name))[1] = (select auth.uid())::text);
