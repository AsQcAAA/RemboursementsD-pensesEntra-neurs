-- Entraîneur invité pour UN match précis (Chevaliers, match de saison à
-- l'extérieur) : une personne hors du staff de l'équipe que le chef peut
-- ajouter à la liste de présence de ce match seulement. Écriture par
-- /api/invites-match (clé de service, après vérification des droits).

create table if not exists game_guests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  staff_id uuid not null references staff (id) on delete cascade,
  added_by uuid references staff (id),
  created_at timestamptz not null default now(),
  unique (game_id, staff_id)
);
create index if not exists idx_game_guests_team on game_guests (team_id);

alter table game_guests enable row level security;

create policy "équipe lecture - game_guests" on game_guests for select
  using (
    is_direction()
    or exists (
      select 1 from team_staff ts
      where ts.staff_id = current_staff_id() and ts.team_id = game_guests.team_id
    )
  );
