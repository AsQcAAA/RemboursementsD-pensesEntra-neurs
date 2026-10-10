import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fdateLong } from "@/lib/calc";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function age(ddn: string | null): string {
  if (!ddn) return "";
  const [y, m, d] = ddn.split("-").map(Number);
  const n = new Date();
  let a = n.getFullYear() - y;
  if (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d)) a--;
  return ` (${a} ans)`;
}

// Enregistre un rappel d'affilié (journal) puis alerte la direction par
// courriel pour qu'elle prévienne l'organisation d'appartenance du joueur.
// L'autorisation (chef de l'équipe ou direction) est appliquée par la RLS à
// l'insertion — pas de contrôle manuel ici. Un courriel qui échoue
// n'annule jamais le rappel : l'échec est gardé dans le journal.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { affiliateId, type, date, gameId, note } = (await req.json()) as {
    affiliateId: string;
    type: "match" | "pratique";
    date: string;
    gameId?: string | null;
    note?: string;
  };
  if (!affiliateId || (type !== "match" && type !== "pratique") || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    return NextResponse.json({ error: "Joueur, type et date requis." }, { status: 400 });
  }

  const { data: affilie } = await supabase.from("affiliates").select("*, teams(nom)").eq("id", affiliateId).single();
  if (!affilie) return NextResponse.json({ error: "Joueur introuvable ou accès refusé." }, { status: 403 });
  const equipeNom: string = Array.isArray(affilie.teams) ? affilie.teams[0]?.nom : affilie.teams?.nom;

  const { data: moi } = await supabase.from("staff").select("id, full_name").eq("auth_user_id", user.id).single();
  if (!moi) return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });

  let libelle = type === "pratique" ? "Pratique" : "Match";
  let jeuId: string | null = null;
  if (type === "match" && gameId) {
    const { data: g } = await supabase
      .from("games")
      .select("id, team_id, game_date, heure, adversaire, domicile, venues(nom, ville)")
      .eq("id", gameId)
      .single();
    if (!g || g.team_id !== affilie.team_id) {
      return NextResponse.json({ error: "Match invalide pour cette équipe." }, { status: 400 });
    }
    const v = Array.isArray(g.venues) ? g.venues[0] : g.venues;
    jeuId = g.id;
    libelle = `${g.domicile ? "vs" : "@"} ${g.adversaire}${v ? ` — ${v.nom}, ${v.ville}` : ""}${g.heure ? ` (${g.heure})` : ""}`;
  }

  const { data: rappel, error: insertError } = await supabase
    .from("affiliate_callups")
    .insert({
      affiliate_id: affiliateId,
      team_id: affilie.team_id,
      event_type: type,
      event_date: date,
      game_id: jeuId,
      event_label: libelle,
      note: note?.trim() || null,
      called_by: moi.id,
    })
    .select("id")
    .single();
  if (insertError || !rappel) {
    return NextResponse.json({ error: insertError?.message ?? "Échec de l'enregistrement." }, { status: 403 });
  }

  // ---- Alerte à la direction ----
  const service = createServiceClient();
  async function noterAlerte(patch: { alert_sent_at?: string; alert_error?: string }) {
    await service.from("affiliate_callups").update(patch).eq("id", rappel!.id);
  }

  const { data: direction } = await supabase.from("staff").select("email").eq("access_role", "direction");
  const destinataires = (direction ?? []).map((d) => d.email).filter((e): e is string => !!e);
  if (!destinataires.length || !process.env.RESEND_API_KEY) {
    const raison = !destinataires.length ? "Aucune adresse de direction configurée." : "RESEND_API_KEY manquante.";
    await noterAlerte({ alert_error: raison });
    return NextResponse.json({ ok: true, emailSent: false, reason: raison });
  }

  const typeLibelle = type === "match" ? "Match" : "Pratique";
  const lignes: [string, string][] = [
    ["Date de l'événement", fdateLong(date)],
    ["Type", typeLibelle],
    ["Événement", libelle],
    ["Équipe des As", equipeNom],
    ["Rappelé par", moi.full_name],
    ["", ""],
    ["Joueur", affilie.nom],
    ["Date de naissance", affilie.date_naissance ? `${affilie.date_naissance}${age(affilie.date_naissance)}` : "—"],
    ["Position", affilie.position ?? "—"],
    ["Organisation d'appartenance", affilie.provenance ?? "—"],
    ["Division / classe", [affilie.division, affilie.classe].filter(Boolean).join(" ") || "—"],
    ["Ligue", affilie.ligue ?? "—"],
    ["Courriel(s)", affilie.emails?.length ? affilie.emails.join(", ") : "—"],
    ["Téléphone(s)", affilie.telephones?.length ? affilie.telephones.join(", ") : "—"],
  ];
  if (note?.trim()) lignes.push(["Note", note.trim()]);

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
<h2 style="margin:0 0 4px">Rappel d'affilié — ${esc(affilie.nom)}</h2>
<p style="color:#666;margin:0 0 16px">À communiquer à l'organisation d'appartenance du joueur.</p>
<table style="border-collapse:collapse;width:100%">${lignes
    .map(([k, v]) =>
      k === ""
        ? `<tr><td colspan="2" style="padding:6px 0"></td></tr>`
        : `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`
    )
    .join("")}</table></div>`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: process.env.ENVOI_FROM_EMAIL || "rapports@resend.dev",
    to: destinataires,
    subject: `Rappel d'affilié — ${affilie.nom} — ${typeLibelle.toLowerCase()} du ${date} (${equipeNom})`,
    html,
  });
  if (sendError) {
    await noterAlerte({ alert_error: sendError.message });
    return NextResponse.json({ ok: true, emailSent: false, reason: sendError.message });
  }
  await noterAlerte({ alert_sent_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, emailSent: true });
}
