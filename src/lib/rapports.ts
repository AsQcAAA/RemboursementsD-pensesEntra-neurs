// Construit les tableaux d'un rapport (période × équipe) à partir des lignes
// déjà chargées depuis Supabase. Une seule définition, utilisée par l'écran,
// le PDF et le courriel — ils ne peuvent plus diverger.
import {
  calcMatch, calcTournoi, money, km, fdate, periodeDe, PERIODES,
  TAUX_KM, PER_DIEM_MATCH, PER_DIEM_TOURNOI,
  type Venue, type Game, type Tournament, type MatchClaim, type TournamentClaim,
} from "./calc";

export interface StaffRef {
  id: string;
  full_name: string;
}
export interface TeamStaffRow {
  staff_id: string;
  titre: "chef" | "adjoint" | "extra" | "superviseur";
}

export interface LigneRapport {
  type: "match" | "tournoi";
  date: string;
  quoi: string;
  lieu: string;
  noms: string;
  drv: string;
  km: number;
  repas: number;
  total: number;
}
export interface EntraineurTotal {
  id: string;
  nom: string;
  role: string;
  km: number;
  repas: number;
  jours: number;
}

export interface DonneesRapport {
  team: { id: string; nom: string; organisation: string };
  games: (Game & { claim: MatchClaim | null })[];
  tournaments: (Tournament & { claim: TournamentClaim | null })[];
  venues: Record<string, Venue>;
  staff: StaffRef[];
  teamStaff: TeamStaffRow[]; // titre par personne, pour cette équipe
}

function libelleMatch(g: Game): string {
  return (g.domicile ? "vs " : "@ ") + g.adversaire;
}

export function ligneDe(donnees: DonneesRapport, perId?: string) {
  const nomParId = new Map(donnees.staff.map((s) => [s.id, s.full_name]));
  const roleParId = new Map(donnees.teamStaff.map((ts) => [ts.staff_id, ts.titre]));
  const entraineurs = new Map<string, EntraineurTotal>();
  for (const ts of donnees.teamStaff) {
    if (ts.titre === "superviseur") continue;
    entraineurs.set(ts.staff_id, {
      id: ts.staff_id,
      nom: nomParId.get(ts.staff_id) ?? ts.staff_id,
      role: ts.titre === "chef" ? "Ent. chef" : ts.titre === "adjoint" ? "Ent. adjoint" : "Ent. extra",
      km: 0,
      repas: 0,
      jours: 0,
    });
  }

  const lignes: LigneRapport[] = [];

  for (const g of donnees.games) {
    if (g.domicile) continue; // aucune dépense attribuable à domicile
    if (perId && periodeDe(g.date).id !== perId) continue;
    const venue = donnees.venues[g.venueId];
    const c = calcMatch(g, venue, g.claim);
    if (c.total <= 0) continue;
    if (c.kmMontant > 0 && g.claim?.driver && entraineurs.has(g.claim.driver)) {
      entraineurs.get(g.claim.driver)!.km += c.kmMontant;
    }
    for (const id of g.claim?.present ?? []) {
      const e = entraineurs.get(id);
      if (e) {
        e.repas += PER_DIEM_MATCH;
        e.jours += 1;
      }
    }
    lignes.push({
      type: "match",
      date: g.date,
      quoi: libelleMatch(g),
      lieu: venue.ville,
      noms: (g.claim?.present ?? []).map((id) => nomParId.get(id) ?? id).join(", "),
      drv: g.claim?.driver ? (nomParId.get(g.claim.driver) ?? "") : "",
      km: c.kmMontant,
      repas: c.repas,
      total: c.total,
    });
  }

  for (const t of donnees.tournaments) {
    const d0 = t.jours[0]?.date ?? "2027-04-30";
    if (perId && periodeDe(d0).id !== perId) continue;
    const c = calcTournoi(t, t.claim);
    if (c.total <= 0) continue;
    if (c.kmMontant > 0 && t.claim?.driver && entraineurs.has(t.claim.driver)) {
      entraineurs.get(t.claim.driver)!.km += c.kmMontant;
    }
    if (t.exterieur) {
      const vus = new Set<string>();
      for (const j of t.jours) {
        for (const id of t.claim?.presence?.[j.date] ?? []) {
          const e = entraineurs.get(id);
          if (e) {
            e.repas += PER_DIEM_TOURNOI;
            e.jours += 1;
          }
          vus.add(id);
        }
      }
      void vus;
    }
    lignes.push({
      type: "tournoi",
      date: d0,
      quoi: "Tournoi — " + t.nom,
      lieu: t.ville,
      noms: [...new Set(t.jours.flatMap((j) => t.claim?.presence?.[j.date] ?? []))]
        .map((id) => nomParId.get(id) ?? id)
        .join(", "),
      drv: t.claim?.driver ? (nomParId.get(t.claim.driver) ?? "") : "",
      km: c.kmMontant,
      repas: c.repas,
      total: c.total,
    });
  }

  lignes.sort((a, b) => (a.date < b.date ? -1 : 1));
  const actifs = [...entraineurs.values()].filter((e) => e.km || e.repas);
  return {
    lignes,
    actifs,
    km: lignes.reduce((s, x) => s + x.km, 0),
    repas: lignes.reduce((s, x) => s + x.repas, 0),
    total: lignes.reduce((s, x) => s + x.total, 0),
  };
  void roleParId;
}

export interface TableauRapport {
  titre: string;
  emphase?: boolean;
  cols: string[];
  num: number[]; // indices de colonnes numériques (alignées à droite)
  gras?: number[]; // indice de colonne à mettre en évidence (montants à verser)
  rows: string[][];
  foot: string[];
}

export function tableauxRapport(donnees: DonneesRapport, perId?: string): { R: ReturnType<typeof ligneDe>; tables: TableauRapport[] } {
  const R = ligneDe(donnees, perId);
  const matchs = R.lignes.filter((l) => l.type === "match");
  const tournois = R.lignes.filter((l) => l.type === "tournoi");
  const sommeM = { n: matchs.length, km: matchs.reduce((s, x) => s + x.km, 0), repas: matchs.reduce((s, x) => s + x.repas, 0), total: matchs.reduce((s, x) => s + x.total, 0) };
  const sommeT = { n: tournois.length, km: tournois.reduce((s, x) => s + x.km, 0), repas: tournois.reduce((s, x) => s + x.repas, 0), total: tournois.reduce((s, x) => s + x.total, 0) };

  const activite: string[][] = [];
  if (sommeM.n) activite.push(["Matchs sur la route", String(sommeM.n), money(sommeM.km), money(sommeM.repas), money(sommeM.total)]);
  if (sommeT.n) activite.push(["Tournois", String(sommeT.n), money(sommeT.km), money(sommeT.repas), money(sommeT.total)]);

  const postes: string[][] = [];
  if (R.km) postes.push(["Kilométrage", String(TAUX_KM).replace(".", ",") + " $/km", money(R.km)]);
  if (sommeM.repas) postes.push(["Per diem — matchs", money(PER_DIEM_MATCH) + " par entraîneur", money(sommeM.repas)]);
  if (sommeT.repas) postes.push(["Per diem — tournois", money(PER_DIEM_TOURNOI) + " par entraîneur par jour", money(sommeT.repas)]);

  const tables: TableauRapport[] = [
    {
      titre: "Montants à verser par entraîneur",
      emphase: true,
      gras: [5],
      cols: ["Entraîneur", "Rôle", "Jours", "Kilométrage", "Per diem", "Montant à verser"],
      num: [2, 3, 4, 5],
      rows: R.actifs.map((c) => [c.nom, c.role, String(c.jours), money(c.km), money(c.repas), money(c.km + c.repas)]),
      foot: ["Total à verser", "", "", money(R.km), money(R.repas), money(R.total)],
    },
    {
      titre: "Déplacements de la période",
      cols: ["Date", "Activité", "Lieu", "Entraîneurs présents", "Conducteur", "Kilométrage", "Per diem", "Total"],
      num: [5, 6, 7],
      rows: R.lignes.map((x) => [fdate(x.date), x.quoi, x.lieu, x.noms || "—", x.drv || "—", money(x.km), money(x.repas), money(x.total)]),
      foot: ["", "", "", "", "Total de l'équipe", money(R.km), money(R.repas), money(R.total)],
    },
    {
      titre: "Sommaire par activité",
      cols: ["Activité", "Nombre", "Kilométrage", "Per diem", "Total"],
      num: [1, 2, 3, 4],
      rows: activite,
      foot: ["Total de l'équipe", String(R.lignes.length), money(R.km), money(R.repas), money(R.total)],
    },
    {
      titre: "Sommaire par poste budgétaire",
      cols: ["Poste budgétaire", "Taux appliqué", "Montant"],
      num: [2],
      rows: postes,
      foot: ["Total de l'équipe", "", money(R.total)],
    },
  ];

  return { R, tables };
}

export { libelleMatch, km };

// ---------- Récapitulatif de saison, sur plusieurs équipes ----------

export function recapDe(equipes: (DonneesRapport & { chefNom: string })[]): { tables: TableauRapport[]; km: number; repasM: number; repasT: number; total: number } {
  const parEquipe: string[][] = [];
  const parCoach = new Map<string, EntraineurTotal & { equipes: Set<string> }>();
  const parPeriode: Record<string, { km: number; repas: number; total: number; n: number }> = {};
  let kmTot = 0;
  let repasMTot = 0;
  let repasTTot = 0;

  for (const eq of equipes) {
    const global = ligneDe(eq);
    const matchs = global.lignes.filter((l) => l.type === "match");
    const tournois = global.lignes.filter((l) => l.type === "tournoi");
    kmTot += global.km;
    repasMTot += matchs.reduce((s, x) => s + x.repas, 0);
    repasTTot += tournois.reduce((s, x) => s + x.repas, 0);

    parEquipe.push([eq.team.nom, eq.team.organisation, eq.chefNom, String(global.lignes.length), money(global.km), money(global.repas), money(global.total)]);

    for (const c of global.actifs) {
      const cle = c.id;
      const existant = parCoach.get(cle) ?? { ...c, jours: 0, km: 0, repas: 0, equipes: new Set<string>() };
      existant.equipes.add(eq.team.nom);
      existant.jours += c.jours;
      existant.km += c.km;
      existant.repas += c.repas;
      parCoach.set(cle, existant);
    }

    for (const p of PERIODES) {
      const Rp = ligneDe(eq, p.id);
      parPeriode[p.id] ??= { km: 0, repas: 0, total: 0, n: 0 };
      parPeriode[p.id].km += Rp.km;
      parPeriode[p.id].repas += Rp.repas;
      parPeriode[p.id].total += Rp.total;
      parPeriode[p.id].n += Rp.lignes.length;
    }
  }

  const total = kmTot + repasMTot + repasTTot;
  const coachs = [...parCoach.values()].sort((a, b) => b.km + b.repas - (a.km + a.repas));
  const nActivites = equipes.reduce((s, eq) => s + ligneDe(eq).lignes.length, 0);

  const tables: TableauRapport[] = [
    {
      titre: "Par équipe",
      cols: ["Équipe", "Organisation", "Entraîneur-chef", "Déplacements", "Kilométrage", "Per diem", "Total"],
      num: [3, 4, 5, 6],
      rows: parEquipe,
      foot: ["Total", "", "", String(nActivites), money(kmTot), money(repasMTot + repasTTot), money(total)],
    },
    {
      titre: "Par entraîneur — montants versés",
      emphase: true,
      gras: [6],
      cols: ["Entraîneur", "Rôle", "Équipe(s)", "Jours", "Kilométrage", "Per diem", "Montant versé"],
      num: [3, 4, 5, 6],
      rows: coachs.map((c) => [c.nom, c.role, [...c.equipes].join(" · "), String(c.jours), money(c.km), money(c.repas), money(c.km + c.repas)]),
      foot: ["Total", "", "", "", money(kmTot), money(repasMTot + repasTTot), money(total)],
    },
    {
      titre: "Par poste budgétaire",
      cols: ["Poste budgétaire", "Taux appliqué", "Montant"],
      num: [2],
      rows: [
        ["Kilométrage", "0,54 $/km", money(kmTot)],
        ["Per diem — matchs", money(PER_DIEM_MATCH) + " par entraîneur", money(repasMTot)],
        ["Per diem — tournois", money(PER_DIEM_TOURNOI) + " par entraîneur par jour", money(repasTTot)],
      ],
      foot: ["Total", "", money(total)],
    },
    {
      titre: "Par période de rapport",
      cols: ["Rapport", "Mois couverts", "Échéance", "Déplacements", "Kilométrage", "Per diem", "Total"],
      num: [3, 4, 5, 6],
      rows: PERIODES.map((p) => [p.nom, p.mois, p.remis, String(parPeriode[p.id]?.n ?? 0), money(parPeriode[p.id]?.km ?? 0), money(parPeriode[p.id]?.repas ?? 0), money(parPeriode[p.id]?.total ?? 0)]),
      foot: ["Total", "", "", String(nActivites), money(kmTot), money(repasMTot + repasTTot), money(total)],
    },
  ];

  return { tables, km: kmTot, repasM: repasMTot, repasT: repasTTot, total };
}
