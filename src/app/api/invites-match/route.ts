import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Ajoute/retire un entraîneur invité pour UN match de saison à l'extérieur
// d'une équipe Chevaliers. Réservé au chef de l'équipe (ou à la direction).
// Les droits sont vérifiés ici à partir des données lues sous la session de
// la personne (RLS), puis l'écriture passe par la clé de service parce que
// créer une personne dans l'annuaire n'est pas permis côté navigateur.

async function contexte(gameId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const { data: moi } = await supabase.from("staff").select("id, access_role").eq("auth_user_id", user.id).single();
  if (!moi) return { erreur: NextResponse.json({ error: "Profil introuvable." }, { status: 403 }) };

  const { data: game } = await supabase.from("games").select("id, team_id, domicile, teams(organisation)").eq("id", gameId).single();
  if (!game) return { erreur: NextResponse.json({ error: "Match introuvable." }, { status: 404 }) };
  const org = Array.isArray(game.teams) ? game.teams[0]?.organisation : (game.teams as { organisation?: string } | null)?.organisation;
  if (org !== "Chevaliers") {
    return { erreur: NextResponse.json({ error: "Réservé aux équipes des Chevaliers." }, { status: 403 }) };
  }
  if (game.domicile) {
    return { erreur: NextResponse.json({ error: "Seulement pour un match à l'extérieur." }, { status: 400 }) };
  }

  let autorise = moi.access_role === "direction";
  if (!autorise) {
    const { data: ts } = await supabase
      .from("team_staff")
      .select("id")
      .eq("staff_id", moi.id)
      .eq("team_id", game.team_id)
      .eq("titre", "chef")
      .eq("portee", "titulaire")
      .maybeSingle();
    autorise = !!ts;
  }
  if (!autorise) return { erreur: NextResponse.json({ error: "Réservé au chef de l'équipe." }, { status: 403 }) };

  return { moi, game };
}

export async function POST(req: NextRequest) {
  const { gameId, nom } = (await req.json()) as { gameId: string; nom: string };
  const nomPropre = (nom ?? "").replace(/\s+/g, " ").trim();
  if (!gameId || nomPropre.length < 3 || nomPropre.length > 80) {
    return NextResponse.json({ error: "Nom complet requis (prénom et nom)." }, { status: 400 });
  }
  const ctx = await contexte(gameId);
  if (ctx.erreur) return ctx.erreur;

  const service = createServiceClient();
  // Même nom (sans égard à la casse) = même personne : on réutilise sa fiche
  // plutôt que d'en créer une seconde.
  const { data: existant } = await service.from("staff").select("id, full_name").ilike("full_name", nomPropre).limit(1).maybeSingle();
  let staffId = existant?.id as string | undefined;
  if (!staffId) {
    const { data: cree, error } = await service.from("staff").insert({ full_name: nomPropre }).select("id").single();
    if (error || !cree) return NextResponse.json({ error: error?.message ?? "Échec de la création." }, { status: 500 });
    staffId = cree.id;
  }

  const { error: gErr } = await service
    .from("game_guests")
    .upsert({ game_id: gameId, team_id: ctx.game!.team_id, staff_id: staffId, added_by: ctx.moi!.id }, { onConflict: "game_id,staff_id" });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, staffId, nom: existant?.full_name ?? nomPropre });
}

export async function DELETE(req: NextRequest) {
  const { gameId, staffId } = (await req.json()) as { gameId: string; staffId: string };
  if (!gameId || !staffId) return NextResponse.json({ error: "Match et personne requis." }, { status: 400 });
  const ctx = await contexte(gameId);
  if (ctx.erreur) return ctx.erreur;

  const service = createServiceClient();
  const { error } = await service.from("game_guests").delete().eq("game_id", gameId).eq("staff_id", staffId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
