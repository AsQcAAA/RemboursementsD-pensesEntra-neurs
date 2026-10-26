-- Per diem journalier propre à un tournoi (par entraîneur et par jour).
-- Null = tarif standard de 82,50 $ (PER_DIEM_TOURNOI dans src/lib/calc.ts).
alter table tournaments add column if not exists per_diem_jour numeric;
