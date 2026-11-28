create table public.plans (
  id text primary key,
  name text not null,
  price_idr integer not null check (price_idr > 0),
  duration_days integer not null check (duration_days > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;

create policy "Read plans" on public.plans for select to anon, authenticated using (true);

insert into public.plans (id, name, price_idr, duration_days) values
  ('sprint', 'Sprint Pass', 15000, 7),
  ('premium', 'Premium', 29000, 30),
  ('yearly', 'Tahunan', 299000, 365);

create table public.payment_orders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  amount_idr integer not null check (amount_idr > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  midtrans_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payment_orders_user_id_idx on public.payment_orders (user_id);

create trigger payment_orders_set_updated_at before update on public.payment_orders
  for each row execute function public.set_updated_at();

alter table public.payment_orders enable row level security;

create policy "Read own payment orders" on public.payment_orders for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Read own subscription" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.complete_payment(p_order_id text, p_transaction_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  paid_order public.payment_orders;
  days integer;
begin
  update public.payment_orders
    set status = 'paid', paid_at = now(), midtrans_transaction_id = p_transaction_id
    where id = p_order_id and status = 'pending'
    returning * into paid_order;
  if not found then
    return false;
  end if;
  select duration_days into days from public.plans where id = paid_order.plan_id;
  insert into public.subscriptions (user_id, plan_id, starts_at, ends_at)
    values (paid_order.user_id, paid_order.plan_id, now(), now() + make_interval(days => days))
    on conflict (user_id) do update set
      plan_id = excluded.plan_id,
      starts_at = case when public.subscriptions.ends_at > now() then public.subscriptions.starts_at else now() end,
      ends_at = greatest(public.subscriptions.ends_at, now()) + make_interval(days => days);
  return true;
end;
$$;

revoke execute on function public.complete_payment(text, text) from public, anon, authenticated;
