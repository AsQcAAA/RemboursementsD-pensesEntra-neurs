"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Venue, Game, Tournament, MatchClaim, TournamentClaim } from "@/lib/calc";
import type { StaffRef, TeamStaffRow } from "@/lib/rapports";

export interface GameRow extends Game {
  claim: MatchClaim | null;
}
export interface TournamentRow extends Tournament {
  claim: TournamentClaim | null;
}

/** Charge tout ce qu'il faut pour afficher/éditer le calendrier d'une
 * équipe, et expose les fonctions de sauvegarde des réclamations. Les
 * écritures mettent d'abord à jour l'état local (l'écran répond tout de
 * suite), puis persistent vers Supabase. */
export function useDonneesEquipe(teamId: string | null) {
  const supabase = createClient();
  const [venues, setVenues] = useState<Record<string, Venue>>({});
  const [games, setGames] = useState<GameRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [staffAll, setStaffAll] = useState<StaffRef[]>([]);
  const [teamStaffAll, setTeamStaffAll] = useState<(TeamStaffRow & { team_id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const recharger = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const [{ data: venuesRows }, { data: gamesRows }, { data: tournamentsRows }, { data: staffRows }, { data: teamStaffRows }] =
      await Promise.all([
        supabase.from("venues").select("*"),
        supabase.from("games").select("*, claims(*)").eq("team_id", teamId),
        supabase.from("tournaments").select("*, tournament_days(*), claims(*)").eq("team_id", teamId),
        supabase.from("staff").select("id, full_name"),
        supabase.from("team_staff").select("staff_id, team_id, titre, portee").eq("team_id", teamId),
      ]);

    setVenues(
      Object.fromEntries(
        (venuesRows ?? []).map((v) => [
          v.id,
          { id: v.id, nom: v.nom, ville: v.ville, km: Number(v.km), minutes: v.minutes, domicile: v.domicile, autocar: v.autocar },
        ])
      )
    );
    setGames(
      (gamesRows ?? []).map((g) => {
        const c = Array.isArray(g.claims) ? g.claims[0] : g.claims;
        return {
          id: g.id, teamId: g.team_id, date: g.game_date, heure: g.heure, venueId: g.venue_id,
          adversaire: g.adversaire, domicile: g.domicile, horsConcours: g.hors_concours,
          forcedCar: g.forced_car, busDepartureNote: g.bus_departure_note,
          claim: c ? { present: c.present_staff_ids ?? [], driver: c.driver_staff_id, note: c.note } : null,
        };
      })
    );
    setTournaments(
      (tournamentsRows ?? []).map((t) => {
        const c = Array.isArray(t.claims) ? t.claims[0] : t.claims;
        return {
          id: t.id, teamId: t.team_id, nom: t.nom, ville: t.ville, debut: t.debut, fin: t.fin,
          exterieur: t.exterieur, caseKm: t.case_km, optionnel: t.optionnel, indice: t.indice,
          jours: (t.tournament_days ?? [])
            .map((j: { jour_date: string; statut: "office" | "option" }) => ({ date: j.jour_date, statut: j.statut }))
            .sort((a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : 1)),
          claim: c ? { km: c.tournament_km, driver: c.driver_staff_id, presence: c.tournament_presence ?? {} } : null,
        };
      })
    );
    setStaffAll(staffRows ?? []);
    setTeamStaffAll((teamStaffRows ?? []) as (TeamStaffRow & { team_id: string })[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const teamStaff = teamStaffAll.filter((ts) => ts.titre !== "superviseur");

  async function sauverClaimMatch(gameId: string, patch: Partial<MatchClaim>) {
    setGames((cur) => cur.map((g) => (g.id === gameId ? { ...g, claim: { present: [], driver: null, ...g.claim, ...patch } } : g)));
    const game = games.find((g) => g.id === gameId);
    const claim = { present: [], driver: null, ...game?.claim, ...patch };
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("claims").upsert(
      {
        team_id: teamId,
        game_id: gameId,
        present_staff_ids: claim.present,
        driver_staff_id: claim.driver,
        note: claim.note ?? null,
        updated_by: userData.user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id" }
    );
  }

  async function effacerClaimMatch(gameId: string) {
    setGames((cur) => cur.map((g) => (g.id === gameId ? { ...g, claim: null } : g)));
    await supabase.from("claims").delete().eq("game_id", gameId);
  }

  async function sauverClaimTournoi(tournamentId: string, patch: Partial<TournamentClaim>) {
    setTournaments((cur) =>
      cur.map((t) => (t.id === tournamentId ? { ...t, claim: { km: null, driver: null, presence: {}, ...t.claim, ...patch } } : t))
    );
    const tournoi = tournaments.find((t) => t.id === tournamentId);
    const claim = { km: null, driver: null, presence: {}, ...tournoi?.claim, ...patch };
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("claims").upsert(
      {
        team_id: teamId,
        tournament_id: tournamentId,
        tournament_km: claim.km,
        driver_staff_id: claim.driver,
        tournament_presence: claim.presence,
        updated_by: userData.user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tournament_id" }
    );
  }

  return {
    venues, games, tournaments, staffAll, teamStaff, loading,
    recharger, sauverClaimMatch, effacerClaimMatch, sauverClaimTournoi,
  };
}

/** Même chargement que useDonneesEquipe, mais pour plusieurs équipes à la
 * fois — utilisé par le Récapitulatif (superviseur/direction) et le tableau
 * de bord Direction, où les données de chaque équipe doivent être
 * disponibles simultanément plutôt qu'une à la fois. */
export function useDonneesMultiEquipes(teamIds: string[]) {
  const supabase = createClient();
  const [venues, setVenues] = useState<Record<string, Venue>>({});
  const [gamesParEquipe, setGamesParEquipe] = useState<Record<string, GameRow[]>>({});
  const [tournamentsParEquipe, setTournamentsParEquipe] = useState<Record<string, TournamentRow[]>>({});
  const [staffAll, setStaffAll] = useState<StaffRef[]>([]);
  const [teamStaffParEquipe, setTeamStaffParEquipe] = useState<Record<string, (TeamStaffRow & { staff_id: string })[]>>({});
  const [loading, setLoading] = useState(true);
  const cle = teamIds.slice().sort().join(",");

  useEffect(() => {
    if (!teamIds.length) {
      setLoading(false);
      return;
    }
    let annule = false;
    (async () => {
      setLoading(true);
      const [{ data: venuesRows }, { data: gamesRows }, { data: tournamentsRows }, { data: staffRows }, { data: teamStaffRows }] =
        await Promise.all([
          supabase.from("venues").select("*"),
          supabase.from("games").select("*, claims(*)").in("team_id", teamIds),
          supabase.from("tournaments").select("*, tournament_days(*), claims(*)").in("team_id", teamIds),
          supabase.from("staff").select("id, full_name"),
          supabase.from("team_staff").select("staff_id, team_id, titre, portee").in("team_id", teamIds),
        ]);
      if (annule) return;

      const v = Object.fromEntries(
        (venuesRows ?? []).map((x) => [
          x.id,
          { id: x.id, nom: x.nom, ville: x.ville, km: Number(x.km), minutes: x.minutes, domicile: x.domicile, autocar: x.autocar },
        ])
      );
      setVenues(v);

      const gpe: Record<string, GameRow[]> = {};
      for (const g of gamesRows ?? []) {
        const c = Array.isArray(g.claims) ? g.claims[0] : g.claims;
        (gpe[g.team_id] ??= []).push({
          id: g.id, teamId: g.team_id, date: g.game_date, heure: g.heure, venueId: g.venue_id,
          adversaire: g.adversaire, domicile: g.domicile, horsConcours: g.hors_concours,
          forcedCar: g.forced_car, busDepartureNote: g.bus_departure_note,
          claim: c ? { present: c.present_staff_ids ?? [], driver: c.driver_staff_id, note: c.note } : null,
        });
      }
      setGamesParEquipe(gpe);

      const tpe: Record<string, TournamentRow[]> = {};
      for (const t of tournamentsRows ?? []) {
        const c = Array.isArray(t.claims) ? t.claims[0] : t.claims;
        (tpe[t.team_id] ??= []).push({
          id: t.id, teamId: t.team_id, nom: t.nom, ville: t.ville, debut: t.debut, fin: t.fin,
          exterieur: t.exterieur, caseKm: t.case_km, optionnel: t.optionnel, indice: t.indice,
          jours: (t.tournament_days ?? [])
            .map((j: { jour_date: string; statut: "office" | "option" }) => ({ date: j.jour_date, statut: j.statut }))
            .sort((a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : 1)),
          claim: c ? { km: c.tournament_km, driver: c.driver_staff_id, presence: c.tournament_presence ?? {} } : null,
        });
      }
      setTournamentsParEquipe(tpe);

      setStaffAll(staffRows ?? []);
      const tspe: Record<string, (TeamStaffRow & { staff_id: string })[]> = {};
      for (const ts of (teamStaffRows ?? []) as (TeamStaffRow & { staff_id: string; team_id: string })[]) {
        if (ts.titre === "superviseur") continue;
        (tspe[ts.team_id] ??= []).push(ts);
      }
      setTeamStaffParEquipe(tspe);
      setLoading(false);
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return { venues, gamesParEquipe, tournamentsParEquipe, staffAll, teamStaffParEquipe, loading };
}
