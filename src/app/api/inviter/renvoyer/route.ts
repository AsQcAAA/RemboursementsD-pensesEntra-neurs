import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Renvoie l'accès à un entraîneur déjà invité (courriel perdu ou expiré).
// Deux cas côté Supabase : la personne n'a jamais choisi son mot de passe
// → réinvitation directe (même courriel) ; elle l'a déjà fait (compte
// confirmé) → l'invitation échoue, on retombe sur un courriel de
// réinitialisation, qui mène à la même page. Patron repris de l'appli M17.
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
    return NextResponse.json({ error: "Seule la direction peut renvoyer une invitation." }, { status: 403 });
  }

  const { staffId } = (await req.json()) as { staffId: string };
  if (!staffId) {
    return NextResponse.json({ error: "staffId requis." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: target, error: getError } = await service.auth.admin.getUserById(staffId);
  const email = target?.user?.email;
  if (getError || !email) {
    return NextResponse.json({ error: "Impossible de retrouver le courriel de cette personne." }, { status: 404 });
  }

  const siteUrl = req.nextUrl.origin;
  const redirectTo = `${siteUrl}/definir-mot-de-passe`;

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!inviteError) {
    return NextResponse.json({ ok: true, mode: "invite" });
  }

  const { error: resetError } = await service.auth.resetPasswordForEmail(email, { redirectTo });
  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: "reset" });
}
