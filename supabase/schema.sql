-- Schéma initial — à exécuter dans l'éditeur SQL du nouveau projet Supabase.
--
-- Portail de remboursements de dépenses des As de Québec et des Chevaliers
-- de la Seigneurie (10 équipes). Projet Supabase séparé de l'appli M17
-- (as-quebec-m17) : ce projet ne contient aucune donnée de joueur, médicale
-- ou de blessure — seulement des entraîneurs-chefs, des horaires et des
-- montants réclamés. Voir /Users/jeangf/.claude/plans/iterative-inventing-map.md
-- pour le pourquoi de cette séparation.
--
-- Convention reprise de l'appli M17 : chaque table active RLS immédiatement
-- après sa création, avec des politiques nommées en français décrivant qui
-- y a droit.

create extension if not exists pgcrypto;

-- ============ Équipes et arénas ============

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  organisation text not null check (organisation in ('As', 'Chevaliers')),
  created_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  ville text not null,
  km numeric not null, -- distance aller depuis l'Aréna Duberger
  minutes integer not null,
  domicile boolean not null default false,
  autocar boolean not null default false, -- plus de 2h de route : autocar de luxe
  created_at timestamptz not null default now()
);

-- ============ Entraîneurs ============
-- Un compte par entraîneur-chef (et par superviseur/direction) — les
-- adjoints et extras restent des personnes cochées dans une liste, pas des
-- comptes, comme cette saison.

create table if not exists staff (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  access_role text not null default 'coach' check (access_role in ('coach', 'direction')),
  created_at timestamptz not null default now()
);

create table if not exists team_staff (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  titre text not null check (titre in ('chef', 'adjoint', 'extra')),
  -- 'titulaire' = fait partie du personnel de cette équipe (coche les présences).
  -- 'superviseur' = supervision en lecture seule (ex. Renaud Blais sur les 4
  -- autres équipes Chevaliers) — ne coche jamais de présence pour l'équipe.
  portee text not null default 'titulaire' check (portee in ('titulaire', 'superviseur')),
  unique (staff_id, team_id)
);

-- ============ Calendrier ============

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  game_date date not null,
  heure text, -- "14:00" ou null si inconnue
  venue_id uuid not null references venues (id),
  adversaire text not null,
  domicile boolean not null default false,
  hors_concours boolean not null default false,
  -- Déplacement fait en voiture malgré une distance qui commanderait
  -- l'autocar (ex. absence exceptionnelle d'autocar) — rouvre le km pour ce
  -- match précis seulement.
  forced_car boolean not null default false,
  bus_departure_note text,
  league_num text,
  created_at timestamptz not null default now()
);
create index if not exists idx_games_team on games (team_id);

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  nom text not null,
  ville text not null,
  debut date,
  fin date,
  -- false = tournoi à domicile : aucun per diem, aucune présence à relever,
  -- seulement le kilométrage total de la fin de semaine s'il y a lieu.
  exterieur boolean not null default true,
  case_km boolean not null default true, -- false = aucun km réclamable (ex. Pee-Wee M13)
  optionnel boolean not null default false,
  indice text, -- date pressentie affichée tant que le tournoi est optionnel
  created_at timestamptz not null default now()
);
create index if not exists idx_tournaments_team on tournaments (team_id);

create table if not exists tournament_days (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  jour_date date not null,
  statut text not null check (statut in ('office', 'option')),
  unique (tournament_id, jour_date)
);

-- ============ Réclamations ============

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  game_id uuid references games (id) on delete cascade,
  tournament_id uuid references tournaments (id) on delete cascade,
  present_staff_ids uuid[] not null default '{}', -- match seulement
  driver_staff_id uuid references staff (id),
  tournament_km numeric, -- km total déclaré pour la fin de semaine (tournoi)
  tournament_presence jsonb not null default '{}'::jsonb, -- {date: [staff_id,...]}
  note text,
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now(),
  constraint claims_une_cible check (
    (case when game_id is not null then 1 else 0 end)
    + (case when tournament_id is not null then 1 else 0 end) = 1
  ),
  unique (game_id),
  unique (tournament_id)
);
create index if not exists idx_claims_team on claims (team_id);

-- ============ Hébergement (tournois à l'extérieur) ============

create table if not exists hotels (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references tournaments (id) on delete cascade,
  hotel_name text,
  address text,
  phone text,
  confirmation_code text,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists hotel_documents (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  file_url text not null,
  file_name text,
  uploaded_at timestamptz not null default now()
);

-- ============ Rapports (4 par équipe par saison) ============

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  periode text not null check (periode in ('r1', 'r2', 'r3', 'r4')),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoye')),
  total numeric not null default 0,
  sent_at timestamptz,
  sent_by uuid references staff (id),
  recipients text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, periode)
);

-- ============ RLS ============

alter table teams enable row level security;
alter table venues enable row level security;
alter table staff enable row level security;
alter table team_staff enable row level security;
alter table games enable row level security;
alter table tournaments enable row level security;
alter table tournament_days enable row level security;
alter table claims enable row level security;
alter table hotels enable row level security;
alter table hotel_documents enable row level security;
alter table reports enable row level security;

-- Référentiel (équipes, arénas, calendrier) : lecture pour tout entraîneur
-- connecté à ce projet, écriture réservée à la direction.
create policy "lecture entraîneurs - teams" on teams for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction - teams" on teams for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

create policy "lecture entraîneurs - venues" on venues for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction - venues" on venues for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

create policy "lecture entraîneurs - games" on games for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction - games" on games for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

create policy "lecture entraîneurs - tournaments" on tournaments for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction - tournaments" on tournaments for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

create policy "lecture entraîneurs - tournament_days" on tournament_days for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction - tournament_days" on tournament_days for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

-- Annuaire : lecture pour tout entraîneur connecté (afficher des noms), mais
-- la création de comptes passe exclusivement par /api/inviter (clé de
-- service, contourne RLS) pour rester synchronisée avec Supabase Auth. La
-- direction peut corriger un nom après coup.
create policy "lecture entraîneurs - staff" on staff for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction corrige - staff" on staff for update
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

create policy "lecture entraîneurs - team_staff" on team_staff for select
  using (exists (select 1 from staff s where s.id = auth.uid()));
create policy "direction - team_staff" on team_staff for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

-- Réclamations : l'équipe titulaire lit et écrit ses propres réclamations,
-- un superviseur les lit sans les modifier, la direction a accès complet.
create policy "titulaire - claims" on claims for all
  using (
    exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
    or exists (
      select 1 from team_staff ts
      where ts.staff_id = auth.uid() and ts.team_id = claims.team_id and ts.portee = 'titulaire'
    )
  )
  with check (
    exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
    or exists (
      select 1 from team_staff ts
      where ts.staff_id = auth.uid() and ts.team_id = claims.team_id and ts.portee = 'titulaire'
    )
  );
create policy "superviseur lecture - claims" on claims for select
  using (
    exists (
      select 1 from team_staff ts
      where ts.staff_id = auth.uid() and ts.team_id = claims.team_id and ts.portee = 'superviseur'
    )
  );

-- Hébergement : lecture pour l'équipe (titulaire ou superviseur) et la
-- direction; écriture réservée à la direction (comme cette saison).
create policy "équipe lecture - hotels" on hotels for select
  using (
    exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
    or exists (
      select 1 from team_staff ts
      join tournaments tr on tr.id = hotels.tournament_id
      where ts.staff_id = auth.uid() and ts.team_id = tr.team_id
    )
  );
create policy "direction écrit - hotels" on hotels for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

create policy "équipe lecture - hotel_documents" on hotel_documents for select
  using (
    exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
    or exists (
      select 1 from team_staff ts
      join tournaments tr on tr.id = hotel_documents.tournament_id
      where ts.staff_id = auth.uid() and ts.team_id = tr.team_id
    )
  );
create policy "direction écrit - hotel_documents" on hotel_documents for all
  using (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'))
  with check (exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction'));

-- Rapports : même patron que les réclamations.
create policy "titulaire - reports" on reports for all
  using (
    exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
    or exists (
      select 1 from team_staff ts
      where ts.staff_id = auth.uid() and ts.team_id = reports.team_id and ts.portee = 'titulaire'
    )
  )
  with check (
    exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
    or exists (
      select 1 from team_staff ts
      where ts.staff_id = auth.uid() and ts.team_id = reports.team_id and ts.portee = 'titulaire'
    )
  );
create policy "superviseur lecture - reports" on reports for select
  using (
    exists (
      select 1 from team_staff ts
      where ts.staff_id = auth.uid() and ts.team_id = reports.team_id and ts.portee = 'superviseur'
    )
  );

-- ============ Stockage — confirmations d'hôtel ============
-- Le compartiment "hotel-docs" doit être créé manuellement dans
-- Supabase > Storage > New bucket (nom exact "hotel-docs", non public).

create policy "hotel-docs - lecture entraîneurs"
  on storage.objects for select
  using (bucket_id = 'hotel-docs' and exists (select 1 from staff s where s.id = auth.uid()));
create policy "hotel-docs - direction dépose"
  on storage.objects for insert
  with check (
    bucket_id = 'hotel-docs'
    and exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
  );
create policy "hotel-docs - direction supprime"
  on storage.objects for delete
  using (
    bucket_id = 'hotel-docs'
    and exists (select 1 from staff s where s.id = auth.uid() and s.access_role = 'direction')
  );
