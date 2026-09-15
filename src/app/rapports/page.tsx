"use client";

import { useState } from "react";
import { useStaff } from "@/lib/useStaff";
import { useDonneesEquipe } from "@/lib/donnees";
import { tableauxRapport } from "@/lib/rapports";
import { PERIODES, money } from "@/lib/calc";

export default function RapportsPage() {
  const { equipesVisibles, loading: loadingStaff } = useStaff();
  const [teamId, setTeamId] = useState<string | null>(null);
  const teamIdEffectif = teamId ?? equipesVisibles[0]?.id ?? null;
  const d = useDonneesEquipe(teamIdEffectif);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<Record<string, string>>({});

  if (loadingStaff) return <p className="text-slate-400">Chargement...</p>;
  if (!teamIdEffectif) return <p className="text-slate-400">Aucune équipe ne t&apos;est rattachée.</p>;

  const donnees = {
    team: equipesVisibles.find((t) => t.id === teamIdEffectif)!,
    games: d.games, tournaments: d.tournaments, venues: d.venues, staff: d.staffAll, teamStaff: d.teamStaff,
  };
  const global = tableauxRapport(donnees);

  async function envoyer(perId: string) {
    setEnvoi((e) => ({ ...e, [perId]: "envoi" }));
    const res = await fetch("/api/envoyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: teamIdEffectif, periode: perId }),
    });
    const data = await res.json().catch(() => ({}));
    setEnvoi((e) => ({ ...e, [perId]: res.ok ? "Envoyé." : data.error || "Échec de l'envoi." }));
  }

  return (
    <div className="space-y-6">
      {equipesVisibles.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {equipesVisibles.map((t) => (
            <button key={t.id} onClick={() => setTeamId(t.id)} className={`badge ${t.id === teamIdEffectif ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}>
              {t.nom}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
        <Stat k="Kilométrage" v={money(global.R.km)} />
        <Stat k="Per diem" v={money(global.R.repas)} />
        <Stat k="Déplacements" v={String(global.R.lignes.length)} />
        <Stat k={`Grand total ${donnees.team.nom}`} v={money(global.R.total)} accent />
      </div>

      <h2 className="text-lg font-bold uppercase tracking-wide">Les quatre rapports de la saison</h2>

      {PERIODES.map((p) => {
        const R = tableauxRapport(donnees, p.id);
        return (
          <div key={p.id} className="border border-ink-700 rounded-lg overflow-hidden bg-ink-800">
            <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-ink-700/50">
              <h3 className="font-semibold">{p.nom} — {p.mois}</h3>
              <span className="text-xs text-slate-500">à remettre {p.remis}</span>
              <div className="flex-1" />
              <span className={`font-mono text-lg ${R.R.total ? "text-gold-400" : "text-slate-600"}`}>{money(R.R.total)}</span>
              <button onClick={() => setOuvert(ouvert === p.id ? null : p.id)} className="btn-secondary text-xs py-1.5 px-3">
                {ouvert === p.id ? "Réduire" : "Détails"}
              </button>
              <button onClick={() => envoyer(p.id)} disabled={!R.R.total || envoi[p.id] === "envoi"} className="btn text-xs py-1.5 px-3">
                {envoi[p.id] === "envoi" ? "…" : "Enregistrer"}
              </button>
            </div>
            {envoi[p.id] && envoi[p.id] !== "envoi" && <div className="px-4 py-1.5 text-xs text-slate-400 border-b border-ink-700">{envoi[p.id]}</div>}
            {ouvert === p.id && (
              <div className="p-4 space-y-6">
                {R.R.lignes.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">Aucune réclamation dans cette période.</p>
                ) : (
                  R.tables.map((T) => <TableauEcran key={T.titre} T={T} />)
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-3">
        <button onClick={() => window.print()} className="btn-secondary text-sm">Imprimer</button>
      </div>
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

function TableauEcran({ T }: { T: ReturnType<typeof tableauxRapport>["tables"][number] }) {
  const gras = T.gras ?? [];
  return (
    <div>
      <h4 className={`font-semibold mb-2 ${T.emphase ? "text-base text-gold-400" : "text-sm"}`}>{T.titre}</h4>
      <div className="overflow-x-auto border border-ink-700 rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-700 text-[11px] uppercase tracking-wide text-slate-400">
              {T.cols.map((c, i) => (
                <th key={c} className={`px-3 py-2 text-left ${T.num.includes(i) ? "text-right" : ""}`}>{c}</th>
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
