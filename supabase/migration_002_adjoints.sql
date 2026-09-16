-- Migration à coller dans SQL Editor sur le projet déjà créé (schema.sql du
-- dépôt a été mis à jour pour un futur projet neuf, mais celui-ci existe déjà
-- et a besoin de ces ALTER plutôt qu'un CREATE TABLE).
--
-- 1) staff.id n'est plus l'id du compte Supabase Auth — un adjoint/extra
--    peut désormais exister sans jamais se connecter.

alter table staff add column auth_user_id uuid unique references auth.users (id) on delete set null;
update staff set auth_user_id = id;
alter table staff drop constraint staff_id_fkey;
alter table staff alter column id set default gen_random_uuid();
alter table staff alter column email drop not null;

-- 2) Fonctions security definer (remplacent auth.uid() = staff.id partout).

create or replace function public.current_staff_id()
returns uuid language sql security definer set search_path = public stable
as $$ select id from staff where auth_user_id = auth.uid() $$;

create or replace function public.is_direction()
returns boolean language sql security definer set search_path = public stable
as $$ select exists (select 1 from staff where auth_user_id = auth.uid() and access_role = 'direction') $$;

-- 3) Politiques RLS réécrites avec ces fonctions.

drop policy "lecture entraîneurs - teams" on teams;
create policy "lecture entraîneurs - teams" on teams for select using (current_staff_id() is not null);
drop policy "direction - teams" on teams;
create policy "direction - teams" on teams for all using (is_direction()) with check (is_direction());

drop policy "lecture entraîneurs - venues" on venues;
create policy "lecture entraîneurs - venues" on venues for select using (current_staff_id() is not null);
drop policy "direction - venues" on venues;
create policy "direction - venues" on venues for all using (is_direction()) with check (is_direction());

drop policy "lecture entraîneurs - games" on games;
create policy "lecture entraîneurs - games" on games for select using (current_staff_id() is not null);
drop policy "direction - games" on games;
create policy "direction - games" on games for all using (is_direction()) with check (is_direction());

drop policy "lecture entraîneurs - tournaments" on tournaments;
create policy "lecture entraîneurs - tournaments" on tournaments for select using (current_staff_id() is not null);
drop policy "direction - tournaments" on tournaments;
create policy "direction - tournaments" on tournaments for all using (is_direction()) with check (is_direction());

drop policy "lecture entraîneurs - tournament_days" on tournament_days;
create policy "lecture entraîneurs - tournament_days" on tournament_days for select using (current_staff_id() is not null);
drop policy "direction - tournament_days" on tournament_days;
create policy "direction - tournament_days" on tournament_days for all using (is_direction()) with check (is_direction());

drop policy "direction corrige - staff" on staff;
create policy "direction corrige - staff" on staff for update using (is_direction()) with check (is_direction());

drop policy "lecture entraîneurs - team_staff" on team_staff;
create policy "lecture entraîneurs - team_staff" on team_staff for select using (current_staff_id() is not null);
drop policy "direction - team_staff" on team_staff;
create policy "direction - team_staff" on team_staff for all using (is_direction()) with check (is_direction());

drop policy "titulaire - claims" on claims;
create policy "titulaire - claims" on claims for all
  using (is_direction() or exists (select 1 from team_staff ts where ts.staff_id = current_staff_id() and ts.team_id = claims.team_id and ts.portee = 'titulaire'))
  with check (is_direction() or exists (select 1 from team_staff ts where ts.staff_id = current_staff_id() and ts.team_id = claims.team_id and ts.portee = 'titulaire'));
drop policy "superviseur lecture - claims" on claims;
create policy "superviseur lecture - claims" on claims for select
  using (exists (select 1 from team_staff ts where ts.staff_id = current_staff_id() and ts.team_id = claims.team_id and ts.portee = 'superviseur'));

drop policy "équipe lecture - hotels" on hotels;
create policy "équipe lecture - hotels" on hotels for select
  using (is_direction() or exists (select 1 from team_staff ts join tournaments tr on tr.id = hotels.tournament_id where ts.staff_id = current_staff_id() and ts.team_id = tr.team_id));
drop policy "direction écrit - hotels" on hotels;
create policy "direction écrit - hotels" on hotels for all using (is_direction()) with check (is_direction());

drop policy "équipe lecture - hotel_documents" on hotel_documents;
create policy "équipe lecture - hotel_documents" on hotel_documents for select
  using (is_direction() or exists (select 1 from team_staff ts join tournaments tr on tr.id = hotel_documents.tournament_id where ts.staff_id = current_staff_id() and ts.team_id = tr.team_id));
drop policy "direction écrit - hotel_documents" on hotel_documents;
create policy "direction écrit - hotel_documents" on hotel_documents for all using (is_direction()) with check (is_direction());

drop policy "titulaire - reports" on reports;
create policy "titulaire - reports" on reports for all
  using (is_direction() or exists (select 1 from team_staff ts where ts.staff_id = current_staff_id() and ts.team_id = reports.team_id and ts.portee = 'titulaire'))
  with check (is_direction() or exists (select 1 from team_staff ts where ts.staff_id = current_staff_id() and ts.team_id = reports.team_id and ts.portee = 'titulaire'));
drop policy "superviseur lecture - reports" on reports;
create policy "superviseur lecture - reports" on reports for select
  using (exists (select 1 from team_staff ts where ts.staff_id = current_staff_id() and ts.team_id = reports.team_id and ts.portee = 'superviseur'));

drop policy "hotel-docs - lecture entraîneurs" on storage.objects;
create policy "hotel-docs - lecture entraîneurs" on storage.objects for select
  using (bucket_id = 'hotel-docs' and current_staff_id() is not null);
drop policy "hotel-docs - direction dépose" on storage.objects;
create policy "hotel-docs - direction dépose" on storage.objects for insert
  with check (bucket_id = 'hotel-docs' and is_direction());
drop policy "hotel-docs - direction supprime" on storage.objects;
create policy "hotel-docs - direction supprime" on storage.objects for delete
  using (bucket_id = 'hotel-docs' and is_direction());

-- 4) Les adjoints/extras des As et des Chevaliers — sans compte, cochables
--    dans les listes de présence. Trois d'entre eux (Jérémy Ste-Marie,
--    Rafael Massé, Olivier Simoneau-Paquet) sont aussi chefs d'une autre
--    équipe : quand tu les inviteras avec connexion plus tard, utilise
--    exactement le même nom pour que /api/inviter réutilise cette ligne au
--    lieu d'en créer une seconde.

insert into staff (full_name, access_role) values
  ('Jeff St-Louis', 'coach'),
  ('Philippe Tremblay', 'coach'),
  ('Jérémy Ste-Marie', 'coach'),
  ('Mathis Bergeron', 'coach'),
  ('Alexis Houle', 'coach'),
  ('Yannick Lamontagne', 'coach'),
  ('Thomas Roberge', 'coach'),
  ('Rafael Massé', 'coach'),
  ('Gabriel Jackson', 'coach'),
  ('Olivier Simoneau-Paquet', 'coach'),
  ('Samuel Poirier', 'coach'),
  ('Pascal Lévesque', 'coach'),
  ('Anthony Hamelin', 'coach'),
  ('Olivier Guilbert', 'coach'),
  ('Romain Gagnon', 'coach'),
  ('Elliot Rouleau', 'coach'),
  ('Bryan Cloutier', 'coach'),
  ('Malick Drolet', 'coach'),
  ('Sylvain Ste-Marie', 'coach'),
  ('Mathias St-Laurent', 'coach');

insert into team_staff (staff_id, team_id, titre, portee)
select s.id, t.id, x.titre, 'titulaire'
from (values
  ('Jeff St-Louis', 'M17 AAA', 'adjoint'),
  ('Philippe Tremblay', 'M17 AAA', 'adjoint'),
  ('Philippe Tremblay', 'M15 AAA', 'adjoint'),
  ('Jérémy Ste-Marie', 'M13 AAA Élite', 'adjoint'),
  ('Mathis Bergeron', 'M13 AAA Élite', 'adjoint'),
  ('Alexis Houle', 'M15 AAA', 'adjoint'),
  ('Alexis Houle', 'M13 AAA', 'adjoint'),
  ('Yannick Lamontagne', 'M15 AAA Élite', 'adjoint'),
  ('Thomas Roberge', 'M15 AAA Élite', 'adjoint'),
  ('Rafael Massé', 'M15 AAA Élite', 'adjoint'),
  ('Gabriel Jackson', 'M13 AAA', 'adjoint'),
  ('Olivier Simoneau-Paquet', 'M18 D1', 'adjoint'),
  ('Olivier Simoneau-Paquet', 'M18 D2', 'extra'),
  ('Samuel Poirier', 'M18 D1', 'adjoint'),
  ('Pascal Lévesque', 'M18 D2', 'adjoint'),
  ('Anthony Hamelin', 'M18 D2', 'adjoint'),
  ('Olivier Guilbert', 'M15 D1R', 'adjoint'),
  ('Romain Gagnon', 'M15 D1R', 'adjoint'),
  ('Elliot Rouleau', 'M15 D1R', 'extra'),
  ('Bryan Cloutier', 'M15 D3', 'adjoint'),
  ('Malick Drolet', 'M15 D3', 'extra'),
  ('Sylvain Ste-Marie', 'M13 D1R', 'adjoint'),
  ('Mathias St-Laurent', 'M13 D1R', 'adjoint')
) as x(full_name, team_nom, titre)
join staff s on s.full_name = x.full_name and s.auth_user_id is null
join teams t on t.nom = x.team_nom;
