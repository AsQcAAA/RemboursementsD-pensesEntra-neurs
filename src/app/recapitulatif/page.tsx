"use client";

import { useState } from "react";
import { useStaff } from "@/lib/useStaff";
import { useDonneesMultiEquipes } from "@/lib/donnees";
import { recapDe, type TableauRapport } from "@/lib/rapports";
import { money } from "@/lib/calc";

export default function RecapitulatifPage() {
  const { equipesVisibles, isDirection, estSuperviseur, loading: loadingStaff } = useStaff();
  const [teamId, setTeamId] = useState<string | null>(null); // null = toutes
  const teamIds = equipesVisibles.map((t) => t.id);
  const d = useDonneesMultiEquipes(teamIds);

  if (loadingStaff || d.loading) return <p className="text-slate-400">Chargement...</p>;
  if (!teamIds.length) return <p className="text-slate-400">Aucune équipe visible.</p>;

  const equipesCiblees = teamId ? equipesVisibles.filter((t) => t.id === teamId) : equipesVisibles;
  const donneesEquipes = equipesCiblees.map((t) => {
    const chef = (d.teamStaffParEquipe[t.id] ?? []).find((ts) => ts.titre === "chef");
    const chefNom = chef ? d.staffAll.find((s) => s.id === chef.staff_id)?.full_name ?? "—" : "—";
    return {
      team: t,
      games: d.gamesParEquipe[t.id] ?? [],
      tournaments: d.tournamentsParEquipe[t.id] ?? [],
      venues: d.venues,
      staff: d.staffAll,
      teamStaff: (d.teamStaffParEquipe[t.id] ?? []).map((ts) => ({ staff_id: ts.staff_id, titre: ts.titre, portee: ts.portee })),
      chefNom,
    };
  });
  const recap = recapDe(donneesEquipes);
  const titre = teamId ? equipesCiblees[0]?.nom : "Toutes les équipes";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
        <Stat k="Kilométrage" v={money(recap.km)} />
        <Stat k="Per diem matchs" v={money(recap.repasM)} />
        <Stat k="Per diem tournois" v={money(recap.repasT)} />
        <Stat k={`Total ${titre}`} v={money(recap.total)} accent />
      </div>

      {equipesVisibles.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTeamId(null)} className={`badge ${!teamId ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}>
            Toutes les équipes
          </button>
          {equipesVisibles.map((t) => (
            <button key={t.id} onClick={() => setTeamId(t.id)} className={`badge ${teamId === t.id ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}>
              {t.nom}
            </button>
          ))}
        </div>
      )}

      <div>
        <h1 className="text-lg font-bold uppercase tracking-wide">Récapitulatif de saison — {titre}</h1>
        <p className="text-xs text-slate-500">{isDirection ? "Vue direction : toutes les équipes" : `Vue superviseur : ${equipesVisibles.length} équipe(s)`}</p>
      </div>

      {recap.tables.map((T) => (
        <TableauEcran key={T.titre} T={T} />
      ))}

      {!isDirection && estSuperviseur && (
        <p className="text-xs bg-ink-800 border-l-2 border-sky-400 px-3 py-2 text-slate-400">
          Vous supervisez {equipesVisibles.length} équipes. La direction dispose de la vue d&apos;ensemble des deux organisations.
        </p>
      )}
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="bg-ink-800 p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className={`font-mono text-xl mt-1 ${accent ? "text-gold-400" : "text-white"}`}>{v}</div>
    </div>
  );
}

function TableauEcran({ T }: { T: TableauRapport }) {
  const gras = T.gras ?? [];
  return (
    <div>
      <h4 className={`font-semibold mb-2 ${T.emphase ? "text-base text-gold-400" : "text-sm"}`}>{T.titre}</h4>
      <div className="overflow-x-auto border border-ink-700 rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-700 text-[11px] uppercase tracking-wide text-slate-400">
              {T.cols.map((c, i) => (
                <th key={c} className={`px-3 py-2 text-left whitespace-nowrap ${T.num.includes(i) ? "text-right" : ""}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {T.rows.length === 0 ? (
              <tr><td colSpan={T.cols.length} className="px-3 py-4 text-center text-slate-500">Aucune donnée.</td></tr>
            ) : (
              T.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-ink-700">
                  {r.map((v, i) => (
                    <td key={i} className={`px-3 py-2 ${T.num.includes(i) ? "text-right font-mono" : ""} ${gras.includes(i) ? "font-bold text-gold-400 text-base" : ""}`}>{v}</td>
                  ))}
                </tr>
              ))
            )}
            <tr className="border-t-2 border-ink-600 bg-ink-700/40 font-semibold">
              {T.foot.map((v, i) => (
                <td key={i} className={`px-3 py-2 ${T.num.includes(i) ? "text-right font-mono" : ""}`}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
