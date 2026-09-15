import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Route publique (voir PUBLIC_PATHS dans proxy.ts) : alimente la liste
// déroulante de l'écran de connexion par NIP. Ne renvoie que des noms — les
// courriels restent côté serveur, utilisés uniquement par /api/connexion.
export async function GET() {
  const service = createServiceClient();
  const { data, error } = await service.from("staff").select("id, full_name").order("full_name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ staff: data });
}
