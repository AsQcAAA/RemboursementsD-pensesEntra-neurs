import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fdateLong } from "@/lib/calc";

const MAX_ACTIVITES = 20;

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

interface ActiviteIn {
  type: "match" | "pratique";
  date: string;
  gameId?: string | null;
  note?: string;
}

// Enregistre une ou plusieurs activités de rappel pour un affilié (journal),
// puis alerte la direction par UN courriel qui les liste toutes, pour
// qu'elle prévienne l'organisation d'appartenance du joueur.
// L'autorisation (chef de l'équipe ou direction) est appliquée par la RLS à
// l'insertion — pas de contrôle manuel ici. Les activités sont insérées en
// une seule requête (tout ou rien). Un courriel qui échoue n'annule jamais
// les rappels : l'échec est gardé dans le journal.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { affiliateId, activites } = (await req.json()) as { affiliateId: string; activites: ActiviteIn[] };
  if (!affiliateId || !Array.isArray(activites) || !activites.length) {
    return NextResponse.json({ error: "Joueur et au moins une activité requis." }, { status: 400 });
  }
  if (activites.length > MAX_ACTIVITES) {
    return NextResponse.json({ error: `Maximum ${MAX_ACTIVITES} activités à la fois.` }, { status: 400 });
  }
  for (const a of activites) {
    if ((a.type !== "match" && a.type !== "pratique") || !/^\d{4}-\d{2}-\d{2}$/.test(a.date ?? "")) {
      return NextResponse.json({ error: "Chaque activité doit avoir un type et une date." }, { status: 400 });
    }
  }
  const cles = new Set(activites.map((a) => `${a.type}|${a.date}`));
  if (cles.size !== activites.length) {
    return NextResponse.json({ error: "Deux activités identiques (même type, même date)." }, { status: 400 });
  }

  const { data: affilie } = await supabase.from("affiliates").select("*, teams(nom)").eq("id", affiliateId).single();
  if (!affilie) return NextResponse.json({ error: "Joueur introuvable ou accès refusé." }, { status: 403 });
  const equipeNom: string = Array.isArray(affilie.teams) ? affilie.teams[0]?.nom : affilie.teams?.nom;

  const { data: moi } = await supabase.from("staff").select("id, full_name").eq("auth_user_id", user.id).single();
  if (!moi) return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });

  // Libellé lisible de chaque activité (pour le journal et le courriel).
  const lignes: { type: "match" | "pratique"; date: string; gameId: string | null; libelle: string; note: string | null }[] = [];
  for (const a of activites) {
    let libelle = a.type === "pratique" ? "Pratique" : "Match";
    let jeuId: string | null = null;
    if (a.type === "match" && a.gameId) {
      const { data: g } = await supabase
        .from("games")
        .select("id, team_id, game_date, heure, adversaire, domicile, venues(nom, ville)")
        .eq("id", a.gameId)
        .single();
      if (!g || g.team_id !== affilie.team_id) {
        return NextResponse.json({ error: "Match invalide pour cette équipe." }, { status: 400 });
      }
      const v = Array.isArray(g.venues) ? g.venues[0] : g.venues;
      jeuId = g.id;
      libelle = `${g.domicile ? "vs" : "@"} ${g.adversaire}${v ? ` — ${v.nom}, ${v.ville}` : ""}${g.heure ? ` (${g.heure})` : ""}`;
    }
    lignes.push({ type: a.type, date: a.date, gameId: jeuId, libelle, note: a.note?.trim() || null });
  }
  lignes.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const { data: rappels, error: insertError } = await supabase
    .from("affiliate_callups")
    .insert(
      lignes.map((l) => ({
        affiliate_id: affiliateId,
        team_id: affilie.team_id,
        event_type: l.type,
        event_date: l.date,
        game_id: l.gameId,
        event_label: l.libelle,
        note: l.note,
        called_by: moi.id,
      }))
    )
    .select("id");
  if (insertError || !rappels?.length) {
    return NextResponse.json({ error: insertError?.message ?? "Échec de l'enregistrement." }, { status: 403 });
  }
  const ids = rappels.map((r) => r.id);

  // ---- Alerte à la direction (un seul courriel pour toutes les activités) ----
  const service = createServiceClient();
  async function noterAlerte(patch: { alert_sent_at?: string; alert_error?: string }) {
    await service.from("affiliate_callups").update(patch).in("id", ids);
  }

  const { data: direction } = await supabase.from("staff").select("email").eq("access_role", "direction");
  const destinataires = (direction ?? []).map((d) => d.email).filter((e): e is string => !!e);
  if (!destinataires.length || !process.env.RESEND_API_KEY) {
    const raison = !destinataires.length ? "Aucune adresse de direction configurée." : "RESEND_API_KEY manquante.";
    await noterAlerte({ alert_error: raison });
    return NextResponse.json({ ok: true, count: ids.length, emailSent: false, reason: raison });
  }

  const joueur: [string, string][] = [
    ["Joueur", affilie.nom],
    ["Date de naissance", affilie.date_naissance ? `${affilie.date_naissance}${age(affilie.date_naissance)}` : "—"],
    ["Position", affilie.position ?? "—"],
    ["Organisation d'appartenance", affilie.provenance ?? "—"],
    ["Division / classe", [affilie.division, affilie.classe].filter(Boolean).join(" ") || "—"],
    ["Ligue", affilie.ligue ?? "—"],
    ["Courriel(s)", affilie.emails?.length ? affilie.emails.join(", ") : "—"],
    ["Téléphone(s)", affilie.telephones?.length ? affilie.telephones.join(", ") : "—"],
    ["Équipe des As", equipeNom],
    ["Rappelé par", moi.full_name],
  ];
  const cellule = "padding:6px 10px;border-bottom:1px solid #ddd;vertical-align:top";
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px">
<h2 style="margin:0 0 4px">Rappel d'affilié — ${esc(affilie.nom)}</h2>
<p style="color:#666;margin:0 0 16px">À communiquer à l'organisation d'appartenance du joueur.</p>
<table style="border-collapse:collapse;width:100%;margin-bottom:20px">
<tr style="background:#f3f3f3;text-align:left"><th style="${cellule}">Date</th><th style="${cellule}">Type</th><th style="${cellule}">Événement</th></tr>
${lignes
  .map(
    (l) =>
      `<tr><td style="${cellule};font-weight:600;white-space:nowrap">${esc(fdateLong(l.date))}</td><td style="${cellule}">${l.type === "match" ? "Match" : "Pratique"}</td><td style="${cellule}">${esc(l.libelle)}${l.note ? `<br><span style="color:#666">${esc(l.note)}</span>` : ""}</td></tr>`
  )
  .join("\n")}
</table>
<table style="border-collapse:collapse;width:100%">${joueur
    .map(
      ([k, v]) =>
        `<tr><td style="padding:5px 12px 5px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:5px 0;font-weight:600">${esc(v)}</td></tr>`
    )
    .join("")}</table></div>`;

  const sujet =
    lignes.length === 1
      ? `Rappel d'affilié — ${affilie.nom} — ${lignes[0].type} du ${lignes[0].date} (${equipeNom})`
      : `Rappel d'affilié — ${affilie.nom} — ${lignes.length} activités du ${lignes[0].date} au ${lignes[lignes.length - 1].date} (${equipeNom})`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: process.env.ENVOI_FROM_EMAIL || "rapports@resend.dev",
    to: destinataires,
    subject: sujet,
    html,
  });
  if (sendError) {
    await noterAlerte({ alert_error: sendError.message });
    return NextResponse.json({ ok: true, count: ids.length, emailSent: false, reason: sendError.message });
  }
  await noterAlerte({ alert_sent_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, count: ids.length, emailSent: true });
}
