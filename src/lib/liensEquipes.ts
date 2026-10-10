// Lien vers l'équipe d'appartenance d'un affilié (statistiques des joueurs,
// calendrier de son équipe régulière). Une table dans le code plutôt qu'en
// base : ce sont des adresses publiques, qu'on complète au fil de la saison
// en ajoutant une ligne ci-dessous.
import type { Affilie } from "./affilies";

const RSEQ = "https://scolaire.rseqhockey.com/fr/teams/";
const SPORDLE = "https://page.spordle.com/fr/lhqca/teams/"; // ligues LHQCA (HQNE, Charlesbourg)

// Chiffriers Google de Jean. Le « /u/2 » de l'adresse d'origine (3e compte
// Google de son navigateur) est retiré : il enverrait les autres au mauvais
// compte.
const CHIFFRIER_CHEVALIERS =
  "https://docs.google.com/spreadsheets/d/1KQbNpRhvdSq9vNXF4jwW0qA11l-BYz5h5rKLFrlDqU4/edit?gid=788034319#gid=788034319";
const CHIFFRIER_AS =
  "https://docs.google.com/spreadsheets/d/1FBQZMHIyBB10ixV7F4rRD0vjRiOvHQGjN00YWrJ4MvI/edit?gid=1483113865#gid=1483113865";

// organisation | division | classe (D1R = D1 Relève)
const EQUIPES: Record<string, { url: string; nom: string }> = {
  "CR|M15|D1": { url: RSEQ + "179917", nom: "Cardinal-Roy M15 D1" },
  "ASL|M15|D1": { url: RSEQ + "179734", nom: "Arsenal ASL M15 D1" },
  "PAL|M15|D1": { url: RSEQ + "180020", nom: "Aths PAL M15 D1" },
  "ASL|M15|D1R": { url: RSEQ + "179736", nom: "Arsenal ASL M15 D1 Relève" },
  "MSA|M15|D1R": { url: RSEQ + "180060", nom: "Vikings MSA M15 D1 Relève" },
  "SJE|M15|D1R": { url: RSEQ + "180203", nom: "St-Jean-Eudes M15 D1 Relève" },
  "CR|M18|D1": { url: RSEQ + "179913", nom: "Cardinal-Roy M18 D1" },
  "ASL|M18|D1": { url: RSEQ + "179742", nom: "Arsenal ASL M18 D1" },
  "ASL|M12|D1": { url: RSEQ + "179737", nom: "Arsenal ASL M12 D1" },
  "ASL|M13|D1": { url: RSEQ + "179740", nom: "Arsenal ASL M13 D1" },
  "CR|M13|D1": { url: RSEQ + "179916", nom: "Cardinal-Roy M13 D1" },
  "HQNE|M17|AA": { url: SPORDLE + "211187", nom: "HQNE M17 AA" },
  "CHB|M13|": { url: SPORDLE + "181400", nom: "Charlesbourg M13 AA" },
};

function organisation(provenance: string): string | null {
  const p = provenance.toLowerCase();
  if (p.startsWith("as de qu")) return "AS";
  if (p.includes("chevaliers")) return "CHEV";
  if (p.includes("arsenal")) return "ASL";
  if (p.includes("hqne")) return "HQNE";
  if (p.includes("charlesbourg")) return "CHB";
  if (p.includes("cardinal-roy")) return "CR";
  if (p.includes("pal")) return "PAL";
  if (p.includes("msa")) return "MSA";
  if (p.includes("jean-eudes")) return "SJE";
  return null;
}

export function lienEquipe(a: Pick<Affilie, "provenance" | "division" | "classe">): { url: string; libelle: string } | null {
  if (!a.provenance) return null;
  const org = organisation(a.provenance);
  if (org === "AS") return { url: CHIFFRIER_AS, libelle: "Calendriers des équipes des As" };
  if (org === "CHEV") return { url: CHIFFRIER_CHEVALIERS, libelle: "Équipes Chevaliers" };
  if (!org) return null;
  const classe = (a.classe ?? "").replace(/\s|-/g, "").toUpperCase();
  const equipe = EQUIPES[`${org}|${a.division ?? ""}|${classe}`];
  return equipe ? { url: equipe.url, libelle: `Stats et calendrier — ${equipe.nom}` } : null;
}
