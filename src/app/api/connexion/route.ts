import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, createServiceClient } from "@/lib/supabase/server";
import { nipToPassword, nipValide } from "@/lib/nip";

// Connexion par NIP à 4 chiffres, comme l'ancien portail. Le courriel réel de
// la personne ne quitte jamais le serveur : on le retrouve via la clé de
// service à partir du staffId choisi dans la liste déroulante, puis on se
// connecte à sa place avec le mot de passe dérivé de son NIP (voir lib/nip.ts).
export async function POST(req: NextRequest) {
  const { staffId, nip } = (await req.json()) as { staffId?: string; nip?: string };

  if (!staffId || !nip || !nipValide(nip)) {
    return NextResponse.json({ error: "Code d'accès invalide." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: staffRow } = await service.from("staff").select("email").eq("id", staffId).single();
  if (!staffRow?.email) {
    return NextResponse.json({ error: "Code d'accès invalide." }, { status: 401 });
  }

  const supabase = await createRouteHandlerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: staffRow.email,
    password: nipToPassword(nip),
  });
  if (error) {
    return NextResponse.json({ error: "Code d'accès invalide." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
