#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Transforme les données déjà validées de l'Artifact (scripts/artifact-data.json)
en supabase/seed.sql : équipes, arénas, calendrier des As, tournois.

N'insère PAS staff/team_staff — ces comptes se créent via /api/inviter quand
Jean invite chaque entraîneur-chef (auth.users n'existe pas encore ici).
Voir scripts/roster-prevu.json pour le rattachement équipe(s)/rôle prévu de
chacun, à confirmer avec de vraies adresses courriel au moment de l'invitation.
"""
import json
import uuid
from pathlib import Path

ICI = Path(__file__).parent
NS = uuid.UUID("6f1b2c3d-4e5f-4a1b-9c2d-3e4f5a6b7c8d")  # espace de noms fixe, pour des ids stables


def uid(*parts: str) -> str:
    return str(uuid.uuid5(NS, "|".join(parts)))


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_bool(v):
    return "true" if v else "false"


def sql_num(v):
    return "null" if v is None else str(v)


data = json.loads((ICI / "artifact-data.json").read_text(encoding="utf-8"))

out = []
out.append("-- Données de saison 2026-27 — générées depuis l'Artifact déjà validé.")
out.append("-- Rejoue sans dupliquer : chaque id est déterministe (uuid5), les insertions")
out.append("-- utilisent ON CONFLICT DO NOTHING / DO UPDATE selon la table.")
out.append("")

# ---------- équipes ----------
out.append("-- ============ Équipes ============")
for t in data["teams"]:
    tid = uid("team", t["id"])
    out.append(
        f"insert into teams (id, nom, organisation) values "
        f"({sql_str(tid)}, {sql_str(t['nom'])}, {sql_str(t['org'])}) "
        f"on conflict (id) do update set nom = excluded.nom, organisation = excluded.organisation;"
    )
out.append("")

# ---------- arénas ----------
out.append("-- ============ Arénas ============")
for v in data["venues"].values():
    vid = uid("venue", v["id"])
    out.append(
        f"insert into venues (id, nom, ville, km, minutes, domicile, autocar) values "
        f"({sql_str(vid)}, {sql_str(v['nom'])}, {sql_str(v['ville'])}, {sql_num(v['km'])}, "
        f"{sql_num(v['min'])}, {sql_bool(v['domicile'])}, {sql_bool(v['autocar'])}) "
        f"on conflict (id) do update set km = excluded.km, minutes = excluded.minutes, "
        f"domicile = excluded.domicile, autocar = excluded.autocar;"
    )
out.append("")

# ---------- calendrier (As seulement — Chevaliers en attente des horaires) ----------
out.append("-- ============ Calendrier ============")
for team_id, games in data["games"].items():
    for g in games:
        gid = uid("game", g["id"])
        tid = uid("team", team_id)
        vid = uid("venue", g["venue"])
        heure = g["heure"] if g.get("heure") else None
        out.append(
            f"insert into games (id, team_id, game_date, heure, venue_id, adversaire, domicile, "
            f"hors_concours, forced_car, league_num) values "
            f"({sql_str(gid)}, {sql_str(tid)}, {sql_str(g['date'])}, {sql_str(heure)}, {sql_str(vid)}, "
            f"{sql_str(g['adv'])}, {sql_bool(g['dom'])}, {sql_bool(g.get('hc', False))}, "
            f"{sql_bool(g.get('voiture', False))}, {sql_str(g.get('num'))}) "
            f"on conflict (id) do update set game_date = excluded.game_date, heure = excluded.heure, "
            f"venue_id = excluded.venue_id, adversaire = excluded.adversaire, domicile = excluded.domicile, "
            f"hors_concours = excluded.hors_concours, forced_car = excluded.forced_car;"
        )
out.append("")

# ---------- tournois ----------
out.append("-- ============ Tournois ============")
for tr in data["tournois"]:
    trid = uid("tournament", tr["id"])
    tid = uid("team", tr["teamId"])
    debut = tr["debut"] or None
    fin = tr["fin"] or None
    indice = tr.get("indice") or None
    out.append(
        f"insert into tournaments (id, team_id, nom, ville, debut, fin, exterieur, case_km, optionnel, indice) values "
        f"({sql_str(trid)}, {sql_str(tid)}, {sql_str(tr['nom'])}, {sql_str(tr['ville'])}, "
        f"{sql_str(debut)}, {sql_str(fin)}, {sql_bool(tr['exterieur'])}, {sql_bool(tr['caseKm'])}, "
        f"{sql_bool(tr['optionnel'])}, {sql_str(indice)}) "
        f"on conflict (id) do update set debut = excluded.debut, fin = excluded.fin, "
        f"exterieur = excluded.exterieur, case_km = excluded.case_km, optionnel = excluded.optionnel, "
        f"indice = excluded.indice;"
    )
    for j in tr.get("jours", []):
        jid = uid("tournament_day", tr["id"], j["date"])
        out.append(
            f"insert into tournament_days (id, tournament_id, jour_date, statut) values "
            f"({sql_str(jid)}, {sql_str(trid)}, {sql_str(j['date'])}, {sql_str(j['statut'])}) "
            f"on conflict (tournament_id, jour_date) do update set statut = excluded.statut;"
        )
out.append("")

(ICI.parent / "supabase" / "seed.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"écrit : supabase/seed.sql ({len(out)} lignes)")

# ---------- roster prévu (référence pour les invitations, pas du SQL) ----------
roster = []
teams_by_id = {t["id"]: t for t in data["teams"]}
for acc in data["accounts"]:
    memberships = []
    for team_id in acc["equipes"]:
        t = teams_by_id[team_id]
        titre = next((s[2] for s in t["staff"] if s[0] == acc["id"]), "Ent. chef")
        memberships.append({"team": t["nom"], "team_id": team_id, "titre": titre, "portee": "titulaire"})
    for team_id in acc.get("superviseur", []):
        if team_id in acc["equipes"]:
            continue
        t = teams_by_id[team_id]
        memberships.append({"team": t["nom"], "team_id": team_id, "titre": "superviseur", "portee": "superviseur"})
    roster.append({
        "nom": acc["nom"],
        "access_role": "direction" if acc.get("admin") else "coach",
        "memberships": memberships,
        "email": "À DEMANDER À JEAN" if acc["id"] != "jean" else "jean.grignonfrancke@asdequebecaaa.com",
    })
(ICI / "roster-prevu.json").write_text(json.dumps(roster, ensure_ascii=False, indent=1), encoding="utf-8")
print("écrit : scripts/roster-prevu.json (référence pour les invitations)")
