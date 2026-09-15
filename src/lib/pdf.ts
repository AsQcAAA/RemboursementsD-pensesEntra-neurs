// Génération de PDF côté serveur (route API), portée de la logique déjà
// testée dans l'Artifact. jsPDF + jspdf-autotable tournent très bien en Node
// (aucun DOM requis) — jspdf-autotable expose applyPlugin() pour s'attacher
// manuellement au constructeur jsPDF hors navigateur.
import { jsPDF } from "jspdf";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import autoTable from "jspdf-autotable";
import { money, fdateLong } from "./calc";
import type { TableauRapport } from "./rapports";

function entete(doc: jsPDF, titre: string, sousTitre: string, ligne3?: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(11, 11, 12);
  doc.rect(0, 0, W, 76, "F");
  doc.setFillColor(255, 194, 14);
  doc.circle(46, 38, 17, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("A", 41, 45);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(titre, 78, 33);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 183, 188);
  doc.text(sousTitre, 78, 51);
  if (ligne3) doc.text(ligne3, 78, 65);
}

function tablePDF(doc: jsPDF, T: TableauRapport, y: number): number {
  const styles: Record<number, Record<string, unknown>> = {};
  T.num.forEach((i) => (styles[i] = { halign: "right" }));
  (T.gras ?? []).forEach((i) => {
    styles[i] = { ...(styles[i] ?? {}), halign: "right", fontStyle: "bold", fontSize: 13, cellWidth: 86, textColor: [11, 11, 12] };
  });
  autoTable(doc, {
    startY: y,
    head: [T.cols],
    body: T.rows.length ? T.rows : [T.cols.map(() => "—")],
    foot: [T.foot],
    styles: { fontSize: T.emphase ? 10 : 8, cellPadding: T.emphase ? 7 : 4, overflow: "linebreak" },
    headStyles: { fillColor: [35, 38, 41], textColor: [255, 194, 14], fontStyle: "bold", fontSize: T.emphase ? 10 : 8 },
    footStyles: { fillColor: T.emphase ? [255, 246, 214] : [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: T.emphase ? 13 : 8 },
    columnStyles: styles,
    margin: { left: 36, right: 36 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY;
}

export function genererPdfRapport(
  equipeNom: string,
  organisation: string,
  periodeNom: string,
  periodeMois: string,
  chefNom: string,
  total: number,
  actifsCount: number,
  tables: TableauRapport[]
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const W = doc.internal.pageSize.getWidth();

  entete(
    doc,
    "Rapport de dépenses — " + equipeNom,
    organisation + " · Saison 2026-27 · " + periodeNom + " (" + periodeMois + ")",
    "Entraîneur-chef : " + chefNom + "   ·   Produit le " + fdateLong(new Date().toISOString().slice(0, 10))
  );

  doc.setFillColor(255, 246, 214);
  doc.rect(36, 88, W - 72, 30, "F");
  doc.setDrawColor(11, 11, 12);
  doc.setLineWidth(1);
  doc.rect(36, 88, W - 72, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(11, 11, 12);
  doc.text("TOTAL À VERSER — " + actifsCount + " entraîneur" + (actifsCount > 1 ? "s" : ""), 46, 107);
  doc.setFontSize(16);
  doc.text(money(total), W - 46, 108, { align: "right" });

  let y = 132;
  tables.forEach((T, i) => {
    doc.setFontSize(T.emphase ? 13 : 11);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    if (i) y += 26;
    doc.text(T.titre, 36, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    y = tablePDF(doc, T, y);
  });

  doc.setFontSize(8);
  doc.setTextColor(120, 124, 130);
  doc.text(
    "Point de repère : Aréna Duberger, Québec. Franchise de 80 km aller-retour, puis 0,54 $/km pour une seule voiture. " +
      "Per diem de 27,50 $ par entraîneur présent à un match, 82,50 $ par entraîneur par jour de tournoi à l'extérieur. " +
      "Le montant est versé à l'entraîneur-chef, qui redistribue.",
    36,
    y + 26,
    { maxWidth: W - 72 }
  );

  return Buffer.from(doc.output("arraybuffer"));
}
