"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Affilie {
  id: string;
  nom: string;
  date_naissance: string | null;
  position: "G" | "D" | "A" | "A/D" | null;
  provenance: string | null;
  division: string | null;
  classe: string | null;
  ligue: string | null;
  emails: string[];
  telephones: string[];
  notes: string | null;
}

export interface Rappel {
  id: string;
  affiliate_id: string;
  event_type: "match" | "pratique";
  event_date: string;
  event_label: string | null;
  note: string | null;
  called_by: string | null;
  created_at: string;
  alert_sent_at: string | null;
  alert_error: string | null;
}

export interface MatchOption {
  id: string;
  date: string;
  heure: string | null;
  libelle: string;
}

/** Affiliés d'une équipe des As, journal de leurs rappels et matchs
 * proposables dans le formulaire de rappel. L'accès (chef de l'équipe ou
 * direction) est appliqué par la base de données — une erreur ici veut dire
 * « pas d'accès » ou « section pas encore activée », pas « liste vide ». */
export function useAffilies(teamId: string | null) {
  const supabase = createClient();
  const [affilies, setAffilies] = useState<Affilie[]>([]);
  const [rappels, setRappels] = useState<Rappel[]>([]);
  const [matchs, setMatchs] = useState<MatchOption[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setErreur(null);
    const [aff, rap, gm, st] = await Promise.all([
      supabase.from("affiliates").select("*").eq("team_id", teamId).order("nom"),
      supabase.from("affiliate_callups").select("*").eq("team_id", teamId).order("created_at", { ascending: false }),
      supabase.from("games").select("id, game_date, heure, adversaire, domicile").eq("team_id", teamId).order("game_date"),
      supabase.from("staff").select("id, full_name"),
    ]);
    if (aff.error || rap.error) {
      setErreur((aff.error ?? rap.error)!.message);
      setLoading(false);
      return;
    }
    setAffilies((aff.data ?? []) as Affilie[]);
    setRappels((rap.data ?? []) as Rappel[]);
    setMatchs(
      (gm.data ?? []).map((g) => ({
        id: g.id,
        date: g.game_date,
        heure: g.heure,
        libelle: `${g.domicile ? "vs" : "@"} ${g.adversaire}`,
      }))
    );
    setNoms(Object.fromEntries((st.data ?? []).map((s) => [s.id, s.full_name])));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    charger();
  }, [charger]);

  return { affilies, rappels, matchs, noms, loading, erreur, recharger: charger };
}
