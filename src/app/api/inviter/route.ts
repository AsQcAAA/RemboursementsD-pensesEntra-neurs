import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { nipToPassword, nipValide } from "@/lib/nip";

type Membership = { team_id: string; titre: "chef" | "adjoint" | "extra"; portee: "titulaire" | "superviseur" };

// Seule la direction peut ajouter du personnel. Deux modes :
// - "connexion" : crée un compte Supabase Auth (mot de passe dérivé du NIP,
//   voir lib/nip.ts) — pour les chefs/superviseurs/direction.
// - "adjoint" : aucune connexion, juste une ligne "staff" cochable dans les
//   listes de présence — pour les adjoints/extras.
// Dans les deux cas, si une ligne "staff" existe déjà avec ce nom exact
// (ex. quelqu'un ajouté d'abord comme adjoint ailleurs, ou déjà chef d'une
// autre équipe), on la réutilise plutôt que d'en créer une seconde — un
// entraîneur qui porte plusieurs chapeaux reste une seule personne.
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
    return NextResponse.json({ error: "Seule la direction peut ajouter du personnel." }, { status: 403 });
  }

  const body = (await req.json()) as {
    mode: "connexion" | "adjoint";
    full_name: string;
    memberships: Membership[];
    email?: string;
    nip?: string;
    access_role?: "coach" | "direction";
  };
  const { mode, full_name, memberships } = body;

  if (!full_name?.trim()) {
    return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: existant } = await service.from("staff").select("id, auth_user_id").eq("full_name", full_name).maybeSingle();

  let staffId: string;

  if (mode === "adjoint") {
    if (existant) {
      staffId = existant.id;
    } else {
      const { data: inserted, error } = await service.from("staff").insert({ full_name }).select("id").single();
      if (error || !inserted) {
        return NextResponse.json({ error: error?.message ?? "Échec de la création." }, { status: 500 });
      }
      staffId = inserted.id;
    }
  } else {
    const { email, nip, access_role } = body;
    if (!email) {
      return NextResponse.json({ error: "Courriel requis." }, { status: 400 });
    }
    if (!nip || !nipValide(nip)) {
      return NextResponse.json({ error: "Le code d'accès doit contenir 4 chiffres." }, { status: 400 });
    }
    if (existant?.auth_user_id) {
      return NextResponse.json({ error: "Cette personne a déjà un compte de connexion." }, { status: 409 });
    }

    const { data: nipPris } = await service.from("staff").select("id").eq("nip", nip).maybeSingle();
    if (nipPris) {
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

    if (existant) {
      const { error: updateError } = await service
        .from("staff")
        .update({ auth_user_id: created.user.id, email, nip, access_role: access_role === "direction" ? "direction" : "coach" })
        .eq("id", existant.id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      staffId = existant.id;
    } else {
      const { data: inserted, error: insertError } = await service
        .from("staff")
        .insert({
          auth_user_id: created.user.id,
          full_name,
          email,
          nip,
          access_role: access_role === "direction" ? "direction" : "coach",
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        return NextResponse.json({ error: insertError?.message ?? "Échec de la création." }, { status: 500 });
      }
      staffId = inserted.id;
    }
  }

  if (memberships?.length) {
    const rows = memberships.map((m) => ({ staff_id: staffId, team_id: m.team_id, titre: m.titre, portee: m.portee }));
    const { error: membershipError } = await service.from("team_staff").upsert(rows, { onConflict: "staff_id,team_id" });
    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
