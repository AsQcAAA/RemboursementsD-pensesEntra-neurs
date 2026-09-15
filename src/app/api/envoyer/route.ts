import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { PERIODES } from "@/lib/calc";
import { tableauxRapport, type DonneesRapport } from "@/lib/rapports";
import { genererPdfRapport } from "@/lib/pdf";

// Génère le PDF et l'envoie par courriel — contrairement à l'Artifact
// d'origine, ceci passe par le serveur de l'application (clé Resend du
// club), donc ça fonctionne pour n'importe quel entraîneur connecté, pas
// seulement le propriétaire du compte.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { teamId, periode } = (await req.json()) as { teamId: string; periode: string };
  const per = PERIODES.find((p) => p.id === periode);
  if (!teamId || !per) {
    return NextResponse.json({ error: "Équipe ou période invalide." }, { status: 400 });
  }

  const [{ data: team }, { data: venuesRows }, { data: gamesRows }, { data: tournamentsRows }, { data: staffRows }, { data: teamStaffRows }] =
    await Promise.all([
      supabase.from("teams").select("*").eq("id", teamId).single(),
      supabase.from("venues").select("*"),
      // Sous RLS : une écriture/lecture de claims n'est permise qu'au titulaire,
      // au superviseur ou à la direction de cette équipe — l'autorisation
      // repose entièrement là-dessus, pas sur un contrôle manuel ici.
      supabase.from("games").select("*, claims(*)").eq("team_id", teamId),
      supabase.from("tournaments").select("*, tournament_days(*), claims(*)").eq("team_id", teamId),
      supabase.from("staff").select("id, full_name"),
      supabase.from("team_staff").select("staff_id, titre").eq("team_id", teamId),
    ]);

  if (!team) {
    return NextResponse.json({ error: "Équipe introuvable ou accès refusé." }, { status: 404 });
  }

  const venues = Object.fromEntries(
    (venuesRows ?? []).map((v) => [
      v.id,
      { id: v.id, nom: v.nom, ville: v.ville, km: Number(v.km), minutes: v.minutes, domicile: v.domicile, autocar: v.autocar },
    ])
  );

  const games = (gamesRows ?? []).map((g) => {
    const c = Array.isArray(g.claims) ? g.claims[0] : g.claims;
    return {
      id: g.id, teamId: g.team_id, date: g.game_date, heure: g.heure, venueId: g.venue_id,
      adversaire: g.adversaire, domicile: g.domicile, horsConcours: g.hors_concours,
      forcedCar: g.forced_car, busDepartureNote: g.bus_departure_note,
      claim: c ? { present: c.present_staff_ids ?? [], driver: c.driver_staff_id } : null,
    };
  });

  const tournaments = (tournamentsRows ?? []).map((t) => {
    const c = Array.isArray(t.claims) ? t.claims[0] : t.claims;
    return {
      id: t.id, teamId: t.team_id, nom: t.nom, ville: t.ville, debut: t.debut, fin: t.fin,
      exterieur: t.exterieur, caseKm: t.case_km, optionnel: t.optionnel, indice: t.indice,
      jours: (t.tournament_days ?? [])
        .map((j: { jour_date: string; statut: "office" | "option" }) => ({ date: j.jour_date, statut: j.statut }))
        .sort((a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : 1)),
      claim: c ? { km: c.tournament_km, driver: c.driver_staff_id, presence: c.tournament_presence ?? {} } : null,
    };
  });

  const donnees: DonneesRapport = {
    team: { id: team.id, nom: team.nom, organisation: team.organisation },
    games,
    tournaments,
    venues,
    staff: staffRows ?? [],
    teamStaff: (teamStaffRows ?? []) as DonneesRapport["teamStaff"],
  };

  const { R, tables } = tableauxRapport(donnees, per.id);
  if (!R.lignes.length) {
    return NextResponse.json({ error: "Aucune réclamation à transmettre pour cette période." }, { status: 400 });
  }

  const chef = (teamStaffRows ?? []).find((ts) => ts.titre === "chef");
  const chefNom = chef ? (staffRows ?? []).find((s) => s.id === chef.staff_id)?.full_name ?? "—" : "—";

  const pdf = genererPdfRapport(team.nom, team.organisation, per.nom, per.mois, chefNom, R.total, R.actifs.length, tables);
  const fichier = `Rapport-${per.court}-${team.nom.replace(/\s+/g, "-")}-2026-27.pdf`;

  const { data: direction } = await supabase.from("staff").select("email").eq("access_role", "direction");
  const destinataires = (direction ?? []).map((d) => d.email).filter(Boolean);
  if (!destinataires.length) {
    return NextResponse.json({ error: "Aucune adresse de direction configurée." }, { status: 500 });
  }
  const copie = user.email && !destinataires.includes(user.email) ? [user.email] : [];

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, emailSent: false, reason: "RESEND_API_KEY manquante." });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sujet = `Rapport de dépenses ${per.court} — ${team.nom} — ${moneyStr(R.total)}`;
  const { error: sendError } = await resend.emails.send({
    from: process.env.ENVOI_FROM_EMAIL || "rapports@resend.dev",
    to: destinataires,
    cc: copie.length ? copie : undefined,
    subject: sujet,
    html: corpsHtml(team.nom, per.nom, per.mois, chefNom, R.total, tables),
    attachments: [{ filename: fichier, content: pdf, contentType: "application/pdf" }],
  });
  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  await supabase.from("reports").upsert(
    {
      team_id: teamId,
      periode: per.id,
      statut: "envoye",
      total: R.total,
      sent_at: new Date().toISOString(),
      sent_by: user.id,
      recipients: [...destinataires, ...copie],
    },
    { onConflict: "team_id,periode" }
  );

  return NextResponse.json({ ok: true, total: R.total, destinataires: [...destinataires, ...copie] });
}

function moneyStr(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",") + " $";
}

function corpsHtml(equipe: string, periodeNom: string, periodeMois: string, chef: string, total: number, tables: ReturnType<typeof tableauxRapport>["tables"]) {
  const tableHtml = (T: (typeof tables)[number]) => {
    const th = (v: string, n: boolean) => `<th align="${n ? "right" : "left"}" style="padding:7px 9px;border-bottom:1px solid #d0d0d0">${esc(v)}</th>`;
    const td = (v: string, n: boolean, b: boolean) =>
      `<td align="${n ? "right" : "left"}" style="padding:${b ? "9px" : "6px"} 9px;border-top:1px solid #e3e3e3${b ? ";font-size:17px;font-weight:700;color:#0B0B0C;white-space:nowrap" : ""}">${esc(v)}</td>`;
    const tf = (v: string, n: boolean, b: boolean) =>
      `<td align="${n ? "right" : "left"}" style="padding:10px 9px;border-top:2px solid #0B0B0C${b ? ";background:#FFF6D6" : ""}"><b>${esc(v)}</b></td>`;
    const g = T.gras ?? [];
    return (
      `<div style="margin-top:24px;font-size:${T.emphase ? "17px" : "15px"};font-weight:600">${esc(T.titre)}</div>` +
      (T.emphase ? `<div style="color:#666;font-size:12px;margin-top:2px">Traité en priorité par la comptabilité.</div>` : "") +
      `<table style="border-collapse:collapse;width:100%;margin-top:6px;font-size:13px${T.emphase ? ";border:2px solid #0B0B0C" : ""}">` +
      `<tr style="background:${T.emphase ? "#FFF6D6" : "#f2f2f2"}">${T.cols.map((c, i) => th(c, T.num.includes(i))).join("")}</tr>` +
      T.rows.map((r) => `<tr>${r.map((v, i) => td(v, T.num.includes(i), g.includes(i))).join("")}</tr>`).join("") +
      `<tr>${T.foot.map((v, i) => tf(v, T.num.includes(i), g.includes(i))).join("")}</tr>` +
      `</table>`
    );
  };
  return (
    `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a">` +
    `<div style="background:#0B0B0C;color:#fff;padding:16px 20px">` +
    `<span style="color:#FFC20E;font-weight:700;letter-spacing:.08em">AS DE QUÉBEC</span>` +
    `<div style="font-size:18px;margin-top:6px">Rapport de dépenses — ${esc(equipe)}</div>` +
    `<div style="color:#9aa0a6;font-size:12px;margin-top:4px">${esc(periodeNom)} · ${esc(periodeMois)} · entraîneur-chef ${esc(chef)}</div></div>` +
    `<div style="margin-top:16px;padding:12px 16px;background:#FFF6D6;border:2px solid #0B0B0C">` +
    `<div style="font-size:12px;letter-spacing:.06em;color:#555">TOTAL À VERSER</div>` +
    `<div style="font-size:26px;font-weight:700;color:#0B0B0C;margin-top:2px">${esc(moneyStr(total))}</div></div>` +
    tables.map(tableHtml).join("") +
    `<p style="color:#666;font-size:12px;margin-top:18px">Le montant est versé à l'entraîneur-chef, qui redistribue. Le même contenu est joint en PDF, prêt à imprimer.</p></div>`
  );
}

function esc(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
