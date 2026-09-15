"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Team {
  id: string;
  nom: string;
  organisation: string;
}
export interface Membership {
  team_id: string;
  titre: "chef" | "adjoint" | "extra" | "superviseur";
  portee: "titulaire" | "superviseur";
}
export interface Me {
  id: string;
  full_name: string;
  access_role: "coach" | "direction";
  memberships: Membership[];
}

/** Le profil de la personne connectée (équipes, rôle) et l'annuaire complet
 * des équipes — chargés une fois, réutilisés par toutes les pages. */
export function useStaff() {
  const supabase = createClient();
  const [me, setMe] = useState<Me | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const [{ data: staffRow }, { data: memberships }, { data: teamsRows }] = await Promise.all([
        supabase.from("staff").select("id, full_name, access_role").eq("id", user.id).single(),
        supabase.from("team_staff").select("team_id, titre, portee").eq("staff_id", user.id),
        supabase.from("teams").select("id, nom, organisation").order("nom"),
      ]);
      if (staffRow) {
        setMe({ ...staffRow, memberships: memberships ?? [] });
      }
      setTeams(teamsRows ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirection = me?.access_role === "direction";
  /** Équipes visibles pour cette personne : toutes si direction, sinon les
   * siennes (titulaire ou superviseur). */
  const equipesVisibles: Team[] = isDirection
    ? teams
    : teams.filter((t) => me?.memberships.some((m) => m.team_id === t.id));
  const estSuperviseur = !isDirection && (me?.memberships.some((m) => m.portee === "superviseur") ?? false);

  return { me, teams, equipesVisibles, isDirection, estSuperviseur, loading };
}
