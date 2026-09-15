import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { nipToPassword, nipValide } from "@/lib/nip";

// Seule la direction peut inviter. Contrairement à l'appli M17, il n'y a pas
// de courriel d'invitation ni d'étape « choisis ton mot de passe » : le
// compte Supabase Auth est créé directement, mot de passe = NIP transformé
// (voir lib/nip.ts) — la personne se connecte tout de suite avec son code à
// 4 chiffres, exactement comme sur l'ancien portail.
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

  const { email, full_name, nip, access_role, memberships } = (await req.json()) as {
    email: string;
    full_name: string;
    nip: string;
    access_role: "coach" | "direction";
    memberships: { team_id: string; titre: "chef" | "adjoint" | "extra"; portee: "titulaire" | "superviseur" }[];
  };

  if (!email || !full_name) {
    return NextResponse.json({ error: "Courriel et nom requis." }, { status: 400 });
  }
  if (!nipValide(nip)) {
    return NextResponse.json({ error: "Le code d'accès doit contenir 4 chiffres." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: existant } = await service.from("staff").select("id").eq("nip", nip).maybeSingle();
  if (existant) {
    return NextResponse.json({ error: "Ce code d'accès est déjà utilisé par quelqu'un d'autre." }, { status: 409 });
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: nipToPassword(nip),
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "Échec de la création du compte." }, { status: 500 });
  }

  const { error: profileError } = await service.from("staff").insert({
    id: created.user.id,
    full_name,
    email,
    nip,
    access_role: access_role === "direction" ? "direction" : "coach",
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (memberships?.length) {
    const rows = memberships.map((m) => ({
      staff_id: created.user!.id,
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
