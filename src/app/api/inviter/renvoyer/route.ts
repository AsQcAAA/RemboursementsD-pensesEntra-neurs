import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { nipToPassword, nipValide } from "@/lib/nip";

// Change le code d'accès d'un entraîneur déjà créé (code oublié, ou attribué
// par erreur). Pas de courriel à renvoyer : la direction communique
// elle-même le nouveau code à la personne.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("staff").select("access_role").eq("auth_user_id", user.id).single();
  if (profile?.access_role !== "direction") {
    return NextResponse.json({ error: "Seule la direction peut changer un code d'accès." }, { status: 403 });
  }

  const { staffId, nip } = (await req.json()) as { staffId: string; nip: string };
  if (!staffId || !nipValide(nip)) {
    return NextResponse.json({ error: "staffId et code d'accès à 4 chiffres requis." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: cible } = await service.from("staff").select("auth_user_id").eq("id", staffId).single();
  if (!cible?.auth_user_id) {
    return NextResponse.json({ error: "Cette personne n'a pas de compte de connexion." }, { status: 404 });
  }

  const { data: existant } = await service.from("staff").select("id").eq("nip", nip).neq("id", staffId).maybeSingle();
  if (existant) {
    return NextResponse.json({ error: "Ce code d'accès est déjà utilisé par quelqu'un d'autre." }, { status: 409 });
  }

  const { error: authError } = await service.auth.admin.updateUserById(cible.auth_user_id, {
    password: nipToPassword(nip),
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const { error: profileError } = await service.from("staff").update({ nip }).eq("id", staffId);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
