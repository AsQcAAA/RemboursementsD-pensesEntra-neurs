-- Affiliés des As (joueurs rappelables d'autres organisations) et journal des
-- rappels. Accès : le chef (titulaire) de l'équipe + la direction — jamais un
-- adjoint ni un superviseur. Contient des coordonnées de mineurs : ne pas
-- ouvrir ces tables à plus de monde sans y repenser.

create or replace function public.est_chef_de(team uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from team_staff ts
    where ts.staff_id = current_staff_id() and ts.team_id = team
      and ts.titre = 'chef' and ts.portee = 'titulaire'
  )
$$;

create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  nom text not null,
  date_naissance date,
  position text check (position in ('G', 'D', 'A', 'A/D')),
  provenance text, -- équipe/organisation d'appartenance du joueur
  division text,
  classe text,
  ligue text,
  emails text[] not null default '{}',
  telephones text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  unique (team_id, nom)
);
create index if not exists idx_affiliates_team on affiliates (team_id);

create table if not exists affiliate_callups (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  event_type text not null check (event_type in ('match', 'pratique')),
  event_date date not null,
  game_id uuid references games (id) on delete set null,
  event_label text, -- instantané lisible (ex. « @ Albatros — Aréna X ») pour le journal et le courriel
  note text,
  called_by uuid references staff (id),
  created_at timestamptz not null default now(),
  alert_sent_at timestamptz, -- courriel d'alerte à la direction
  alert_error text
);
create index if not exists idx_callups_team on affiliate_callups (team_id, event_date desc);
create index if not exists idx_callups_affiliate on affiliate_callups (affiliate_id);

alter table affiliates enable row level security;
alter table affiliate_callups enable row level security;

create policy "chef/direction lecture - affiliates" on affiliates for select
  using (is_direction() or est_chef_de(team_id));
create policy "direction écrit - affiliates" on affiliates for all
  using (is_direction()) with check (is_direction());

create policy "chef/direction lecture - callups" on affiliate_callups for select
  using (is_direction() or est_chef_de(team_id));
create policy "chef/direction enregistre - callups" on affiliate_callups for insert
  with check (
    (is_direction() or est_chef_de(team_id))
    and called_by = current_staff_id()
    and exists (select 1 from affiliates a where a.id = affiliate_id and a.team_id = affiliate_callups.team_id)
  );
create policy "direction corrige - callups" on affiliate_callups for all
  using (is_direction()) with check (is_direction());
