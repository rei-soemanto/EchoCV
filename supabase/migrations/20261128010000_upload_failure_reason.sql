alter table public.uploads
  add column failure_reason text
    check (failure_reason in ('timeout', 'service_unavailable', 'unreadable', 'too_large', 'server'));
