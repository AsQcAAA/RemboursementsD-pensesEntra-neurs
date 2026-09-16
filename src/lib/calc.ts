// Règles de remboursement des As de Québec / Chevaliers de la Seigneurie.
// Portées et déjà vérifiées dans le prototype (Artifact) — mêmes règles,
// mêmes montants. Point de repère : Aréna Duberger, Québec.
export const TAUX_KM = 0.54;
export const SEUIL_KM = 80; // franchise aller-retour, en km
export const PER_DIEM_MATCH = 27.5;
export const PER_DIEM_TOURNOI = 82.5;
// Chevaliers seulement — voir estAutocar() : autobus scolaire au-delà de ce
// seuil (aller), n'importe quel jour, SAUF les journées pédagogiques
// (JOURS_PEDAGOGIQUES_CHEVALIERS ci-dessous) où aucun autobus n'est jamais
// offert, peu importe la distance — un véhicule est remboursé selon le
// kilométrage à la place.
export const SEUIL_AUTOCAR_CHEVALIERS_KM = 200;

// Dates (ISO) sans transport scolaire pour les Chevaliers. Une seule
// confirmée pour l'instant — à compléter au fil de la saison si d'autres
// journées pédagogiques sont annoncées.
export const JOURS_PEDAGOGIQUES_CHEVALIERS = ["2026-09-18"];

export type Organisation = "As" | "Chevaliers";

export interface Venue {
  id: string;
  nom: string;
  ville: string;
  km: number; // distance aller depuis Duberger
  minutes: number;
  domicile: boolean;
  autocar: boolean; // plus de 2h de route : autocar de luxe, aucun km
}

export interface Game {
  id: string;
  teamId: string;
  date: string; // ISO yyyy-mm-dd
  heure: string | null;
  venueId: string;
  adversaire: string;
  domicile: boolean;
  horsConcours: boolean;
  /** Déplacement fait en voiture malgré une distance qui commanderait
   * l'autocar (ex. absence exceptionnelle d'autocar) — rouvre le
   * kilométrage pour ce match précis. */
  forcedCar: boolean;
  busDepartureNote: string | null;
}

export interface MatchClaim {
  present: string[]; // ids de reimb_staff présents
  driver: string | null;
  note?: string;
}

export interface MatchCalc {
  admissible: boolean;
  autocar: boolean;
  kmFacturables: number;
  kmMontant: number;
  repas: number;
  nb: number;
  total: number;
}

/** Un match ne peut ouvrir droit à rien s'il est à domicile ou si le
 * déplacement est sous la franchise de 80 km aller-retour. */
export function matchRemboursable(game: Game, venue: Venue): boolean {
  return !game.domicile && 2 * venue.km > SEUIL_KM;
}

/** Déplacement en autobus (aucun km remboursable) plutôt qu'en voiture. As :
 * propriété fixe de l'aréna. Chevaliers : au-delà de SEUIL_AUTOCAR_CHEVALIERS_KM
 * (aller), n'importe quel jour — sauf une journée pédagogique
 * (JOURS_PEDAGOGIQUES_CHEVALIERS), où ce n'est jamais l'autobus peu importe
 * la distance. */
export function estAutocar(game: Game, venue: Venue, organisation: Organisation = "As"): boolean {
  if (game.forcedCar) return false;
  if (organisation !== "Chevaliers") return venue.autocar;
  if (JOURS_PEDAGOGIQUES_CHEVALIERS.includes(game.date)) return false;
  return venue.km > SEUIL_AUTOCAR_CHEVALIERS_KM;
}

export function calcMatch(game: Game, venue: Venue, claim: MatchClaim | null, organisation: Organisation = "As"): MatchCalc {
  const present = claim?.present ?? [];
  const driver = claim?.driver ?? null;
  const admissible = matchRemboursable(game, venue);
  const autocar = estAutocar(game, venue, organisation);
  const kmFacturables = admissible && !autocar ? Math.max(0, 2 * venue.km - SEUIL_KM) : 0;
  const kmMontant = kmFacturables > 0 && driver ? +(kmFacturables * TAUX_KM).toFixed(2) : 0;
  const repas = admissible ? present.length * PER_DIEM_MATCH : 0;
  return {
    admissible,
    autocar,
    kmFacturables,
    kmMontant,
    repas,
    nb: present.length,
    total: +(kmMontant + repas).toFixed(2),
  };
}

export type JourStatut = "office" | "option";
export interface TournamentDay {
  date: string; // ISO
  statut: JourStatut;
}

/** Journées offertes pour un tournoi : le vendredi est inclus d'office, le
 * jeudi/samedi/dimanche sont en option, le mercredi n'est jamais offert — un
 * tournoi qui débute le mercredi n'ouvre donc le choix qu'à partir du jeudi. */
export function joursOfferts(debut: string, fin: string): TournamentDay[] {
  if (!debut || !fin || fin < debut) return [];
  const out: TournamentDay[] = [];
  const cur = new Date(debut + "T12:00:00");
  const last = new Date(fin + "T12:00:00");
  let garde = 0;
  while (cur <= last && garde < 14) {
    const jour = cur.getDay(); // 0=dim ... 4=jeu, 5=ven, 6=sam
    if (jour === 4 || jour === 5 || jour === 6 || jour === 0) {
      out.push({ date: cur.toISOString().slice(0, 10), statut: jour === 5 ? "office" : "option" });
    }
    cur.setDate(cur.getDate() + 1);
    garde++;
  }
  return out;
}

export interface Tournament {
  id: string;
  teamId: string;
  nom: string;
  ville: string;
  debut: string | null;
  fin: string | null;
  exterieur: boolean; // false = à domicile : aucun per diem, aucune présence à relever
  caseKm: boolean; // false = aucun kilométrage réclamable (ex. Pee-Wee M13)
  optionnel: boolean;
  indice: string | null;
  jours: TournamentDay[];
}

export interface TournamentClaim {
  km: number | null;
  driver: string | null;
  /** date ISO -> ids présents ce jour-là (uniquement pertinent si exterieur) */
  presence: Record<string, string[]>;
}

export interface TournamentCalc {
  kmTotal: number;
  kmFacturables: number;
  kmMontant: number;
  repas: number;
  jours: number;
  presences: number;
  total: number;
}

export function calcTournoi(t: Tournament, claim: TournamentClaim | null): TournamentCalc {
  const kmTotal = claim?.km ?? 0;
  const driver = claim?.driver ?? null;
  const kmFacturables = t.caseKm ? Math.max(0, kmTotal - SEUIL_KM) : 0;
  const kmMontant = kmFacturables > 0 && driver ? +(kmFacturables * TAUX_KM).toFixed(2) : 0;

  let jours = 0;
  let presences = 0;
  let repas = 0;
  if (t.exterieur) {
    for (const j of t.jours) {
      const n = claim?.presence?.[j.date]?.length ?? 0;
      if (n > 0) {
        jours++;
        presences += n;
        repas += n * PER_DIEM_TOURNOI;
      }
    }
  }

  return {
    kmTotal,
    kmFacturables,
    kmMontant,
    repas: +repas.toFixed(2),
    jours,
    presences,
    total: +(kmMontant + repas).toFixed(2),
  };
}

export function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",") + " $";
}

export function km(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(".", ",") + " km";
}

const MOIS = [
  "janv.", "févr.", "mars", "avril", "mai", "juin",
  "juill.", "août", "sept.", "oct.", "nov.", "déc.",
];
const JOURS_SEMAINE = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function fdate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS_SEMAINE[dt.getDay()]} ${d} ${MOIS[m - 1]}`;
}

export function fdateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS_SEMAINE[dt.getDay()]} ${d} ${MOIS[m - 1]} ${y}`;
}

/** Les 4 périodes de rapport de la saison. */
export const PERIODES = [
  { id: "r1", court: "R1", nom: "Rapport 1", mois: "Août · septembre · octobre", debut: "2026-08-01", fin: "2026-10-31", remis: "fin octobre 2026" },
  { id: "r2", court: "R2", nom: "Rapport 2", mois: "Novembre · décembre", debut: "2026-11-01", fin: "2026-12-31", remis: "mi-décembre 2026" },
  { id: "r3", court: "R3", nom: "Rapport 3", mois: "Janvier · février", debut: "2027-01-01", fin: "2027-02-28", remis: "fin février 2027" },
  { id: "r4", court: "R4", nom: "Rapport 4", mois: "Mars · avril", debut: "2027-03-01", fin: "2027-04-30", remis: "fin avril 2027" },
] as const;

export function periodeDe(dateISO: string) {
  return PERIODES.find((p) => dateISO >= p.debut && dateISO <= p.fin) ?? PERIODES[3];
}
