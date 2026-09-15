import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Seule la direction peut inviter. Utilise la clé de service côté serveur
// uniquement (jamais exposée au navigateur) pour envoyer l'invitation
// Supabase; la personne invitée choisit son mot de passe sur
// /definir-mot-de-passe. Patron repris de l'appli M17 (src/app/api/invite),
// étendu pour créer directement les rattachements d'équipe en même temps.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("staff").select("access_role").eq("id", user.id).single();
  if (profile?.access_role !== "direction") {
    return NextResponse.json({ error: "Seule la direction peut inviter." }, { status: 403 });
  }

  const { email, full_name, access_role, memberships } = (await req.json()) as {
    email: string;
    full_name: string;
    access_role: "coach" | "direction";
    memberships: { team_id: string; titre: "chef" | "adjoint" | "extra"; portee: "titulaire" | "superviseur" }[];
  };

  if (!email || !full_name) {
    return NextResponse.json({ error: "Courriel et nom requis." }, { status: 400 });
  }

  const service = createServiceClient();
  const siteUrl = req.nextUrl.origin;
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/definir-mot-de-passe`,
  });

  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? "Échec de l'invitation." }, { status: 500 });
  }

  const { error: profileError } = await service.from("staff").insert({
    id: invited.user.id,
    full_name,
    email,
    access_role: access_role === "direction" ? "direction" : "coach",
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (memberships?.length) {
    const rows = memberships.map((m) => ({
      staff_id: invited.user!.id,
      team_id: m.team_id,
      titre: m.titre,
      portee: m.portee,
    }));
    const { error: membershipError } = await service.from("team_staff").insert(rows);
    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
