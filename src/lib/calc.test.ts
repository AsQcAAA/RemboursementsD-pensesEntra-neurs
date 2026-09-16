// Vérification manuelle des règles de calcul contre les cas déjà validés dans
// l'Artifact. Exécuter : npx tsx src/lib/calc.test.ts
import {
  calcMatch,
  calcTournoi,
  joursOfferts,
  matchRemboursable,
  type Venue,
  type Game,
  type Tournament,
} from "./calc";

let ok = 0;
let ko = 0;
function t(nom: string, obtenu: unknown, attendu: unknown) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) {
    ok++;
  } else {
    ko++;
    console.log(`ECHEC ${nom}\n  obtenu   ${a}\n  attendu  ${b}`);
  }
}

const videotronTR: Venue = { id: "videotron-tr", nom: "Colisée Vidéotron", ville: "Trois-Rivières", km: 131.1, minutes: 83, domicile: false, autocar: false };
const laBaie: Venue = { id: "la-baie", nom: "Centre des sports Jean-Claude-Tremblay", ville: "La Baie", km: 220.7, minutes: 140, domicile: false, autocar: true };
const marcSimoneau: Venue = { id: "marc-simoneau", nom: "Centre sportif Marc-Simoneau", ville: "Québec", km: 10.4, minutes: 12, domicile: true, autocar: false };
const brunoVerret: Venue = { id: "bruno-verret", nom: "Centre Bruno-Verret", ville: "Lévis", km: 28.8, minutes: 28, domicile: false, autocar: false };
const jonquiere: Venue = { id: "jonquiere", nom: "Foyer des loisirs et de la culture", ville: "Jonquière", km: 213.5, minutes: 136, domicile: false, autocar: true };
const cabano: Venue = { id: "cabano", nom: "Aréna Cascade-Cabano", ville: "Témiscouata-sur-le-Lac", km: 260.1, minutes: 198, domicile: false, autocar: true };

function jeu(over: Partial<Game> = {}): Game {
  return {
    id: "g1", teamId: "m17aaa", date: "2027-01-31", heure: "14:30",
    venueId: "videotron-tr", adversaire: "Estacades Mauricie", domicile: false,
    horsConcours: false, forcedCar: false, busDepartureNote: null, ...over,
  };
}

t("Trois-Rivières : 182,2 km facturables", calcMatch(jeu(), videotronTR, { present: ["a"], driver: "a" }).kmFacturables, 182.2);
t("Trois-Rivières : total avec 1 conducteur", calcMatch(jeu(), videotronTR, { present: ["a"], driver: "a" }).total, +(182.2 * 0.54 + 27.5).toFixed(2));
t("Trois-Rivières : sans conducteur = per diem seul", calcMatch(jeu(), videotronTR, { present: ["a", "b"], driver: null }).total, 55);
t("Lévis (28,8 km) : sous la franchise, rien", calcMatch(jeu({ venueId: "bruno-verret" }), brunoVerret, { present: ["a"], driver: "a" }).total, 0);
t("La Baie : autocar, aucun km, per diem 3x", calcMatch(jeu({ venueId: "la-baie" }), laBaie, { present: ["a", "b", "c"], driver: "a" }).total, 82.5);
t("Domicile : rien", calcMatch(jeu({ domicile: true, venueId: "marc-simoneau" }), marcSimoneau, { present: ["a"], driver: "a" }).total, 0);
t("Jonquière hors-concours forcé en voiture : km rouvert", calcMatch(jeu({ venueId: "jonquiere", horsConcours: true, forcedCar: true }), jonquiere, { present: ["a", "b", "c"], driver: "a" }).total, +(347 * 0.54 + 82.5).toFixed(2));
t("Jonquière match régulier : autocar maintenu, aucun km", calcMatch(jeu({ venueId: "jonquiere" }), jonquiere, { present: ["a", "b"], driver: "a" }).kmMontant, 0);
t("Cabano : plus de 2h -> autocar", calcMatch(jeu({ venueId: "cabano" }), cabano, { present: ["a"], driver: "a" }).autocar, true);
t("matchRemboursable() exclut le domicile et sous 40km aller", [matchRemboursable(jeu({ domicile: true }), marcSimoneau), matchRemboursable(jeu({ venueId: "bruno-verret" }), brunoVerret)], [false, false]);

// Chevaliers : jamais d'autobus en semaine (journée pédagogique), peu
// importe la distance ; la fin de semaine, autobus seulement au-delà de
// 200 km aller — sous ce seuil, même règle qu'en semaine (voiture).
// jeu() daté par défaut au 2027-01-31, un dimanche.
t(
  "Chevaliers, fin de semaine, >200km aller : autobus, aucun km",
  calcMatch(jeu({ venueId: "jonquiere" }), jonquiere, { present: ["a"], driver: "a" }, "Chevaliers").autocar,
  true
);
t(
  "Chevaliers, journée pédagogique (semaine), même trajet : voiture, km remboursé",
  calcMatch(jeu({ venueId: "jonquiere", date: "2027-02-01" }), jonquiere, { present: ["a"], driver: "a" }, "Chevaliers").kmFacturables,
  347
);
t(
  "Chevaliers, fin de semaine, sous 200km aller : voiture, km remboursé",
  calcMatch(jeu(), videotronTR, { present: ["a"], driver: "a" }, "Chevaliers").autocar,
  false
);
t(
  "As (organisation par défaut) : règle par aréna inchangée",
  calcMatch(jeu({ venueId: "jonquiere" }), jonquiere, { present: ["a"], driver: "a" }).autocar,
  true
);

const stAugustin: Tournament = { id: "staug", teamId: "m17aaa", nom: "Tournoi de St-Augustin", ville: "St-Augustin", debut: "2026-11-05", fin: "2026-11-08", exterieur: false, caseKm: true, optionnel: false, indice: null, jours: joursOfferts("2026-11-05", "2026-11-08") };
const stJerome: Tournament = { id: "stj", teamId: "m17aaa", nom: "Tournoi de St-Jérôme", ville: "St-Jérôme", debut: "2027-02-04", fin: "2027-02-07", exterieur: true, caseKm: true, optionnel: false, indice: null, jours: joursOfferts("2027-02-04", "2027-02-07") };
const peeWee: Tournament = { id: "pw", teamId: "m13aaae", nom: "Tournoi Pee-Wee", ville: "Québec", debut: null, fin: null, exterieur: false, caseKm: false, optionnel: true, indice: "À confirmer", jours: [] };

t("St-Augustin (domicile) : 168km -80 payés à 1 personne", calcTournoi(stAugustin, { km: 168, driver: "a", presence: {} }).kmMontant, +((168 - 80) * 0.54).toFixed(2));
t("St-Augustin (domicile) : aucun per diem malgré présences", calcTournoi(stAugustin, { km: 168, driver: "a", presence: { "2026-11-06": ["a", "b", "c"] } }).repas, 0);
t("St-Jérôme (extérieur) : per diem sur 2 jours", calcTournoi(stJerome, { km: 600, driver: "a", presence: { "2027-02-05": ["a", "b"], "2027-02-06": ["a", "b", "c"] } }).repas, 5 * 82.5);
t("Pee-Wee : sans case km, rien même avec présence déclarée", calcTournoi(peeWee, { km: 500, driver: "a", presence: {} }).total, 0);

t("mercredi jamais offert (Waterloo débute un mercredi)", joursOfferts("2027-01-27", "2027-01-31").map((j) => j.date), ["2027-01-28", "2027-01-29", "2027-01-30", "2027-01-31"]);
t("vendredi toujours d'office", joursOfferts("2026-11-26", "2026-11-29").map((j) => j.statut), ["option", "office", "option", "option"]);
t("tournoi qui débute un vendredi : 3 jours (pas de jeudi)", joursOfferts("2026-12-04", "2026-12-06").map((j) => j.statut), ["office", "option", "option"]);

console.log(`\n${ok} tests réussis, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
