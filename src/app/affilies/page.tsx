"use client";

import { useMemo, useState } from "react";
import { useStaff } from "@/lib/useStaff";
import { useAffilies, type Affilie, type MatchOption, type Rappel } from "@/lib/affilies";
import { fdate, fdateLong } from "@/lib/calc";

const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function naissance(ddn: string | null): string {
  if (!ddn) return "Date de naissance inconnue";
  const [y, m, d] = ddn.split("-").map(Number);
  const n = new Date();
  let a = n.getFullYear() - y;
  if (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d)) a--;
  return `Né le ${d} ${MOIS_LONGS[m - 1]} ${y} · ${a} ans`;
}

function aujourdhui(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const GROUPES: { id: "G" | "D" | "A"; titre: string }[] = [
  { id: "G", titre: "Gardiens" },
  { id: "D", titre: "Défenseurs" },
  { id: "A", titre: "Attaquants" },
];
const groupeDe = (p: Affilie["position"]) => (p === "G" ? "G" : p === "D" ? "D" : "A");
const couleurPosition: Record<string, string> = {
  G: "bg-sky-900/40 text-sky-200",
  D: "bg-ink-700 text-slate-200",
  A: "bg-gold-500/20 text-gold-300",
  "A/D": "bg-gold-500/20 text-gold-300",
};

export default function AffiliesPage() {
  const { equipesAffilies, loading: loadingStaff } = useStaff();
  const [teamId, setTeamId] = useState<string | null>(null);
  const teamIdEffectif = teamId ?? equipesAffilies[0]?.id ?? null;
  const equipe = equipesAffilies.find((t) => t.id === teamIdEffectif);
  const d = useAffilies(teamIdEffectif);
  const [filtre, setFiltre] = useState<"tous" | "G" | "D" | "A">("tous");
  const [recherche, setRecherche] = useState("");
  const [rappeler, setRappeler] = useState<Affilie | null>(null);

  const rappelsParJoueur = useMemo(() => {
    const m: Record<string, Rappel[]> = {};
    for (const r of d.rappels) (m[r.affiliate_id] ??= []).push(r);
    return m;
  }, [d.rappels]);

  if (loadingStaff) return <p className="text-slate-400">Chargement...</p>;
  if (!teamIdEffectif) return <p className="text-slate-400">Aucune équipe des As ne t&apos;est rattachée.</p>;

  const visibles = d.affilies.filter(
    (a) => (filtre === "tous" || groupeDe(a.position) === filtre) && a.nom.toLowerCase().includes(recherche.trim().toLowerCase())
  );
  const nbMatch = d.rappels.filter((r) => r.event_type === "match").length;
  const nbPratique = d.rappels.length - nbMatch;

  return (
    <div className="space-y-6">
      {equipesAffilies.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {equipesAffilies.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTeamId(t.id); setFiltre("tous"); setRecherche(""); }}
              className={`badge ${t.id === teamIdEffectif ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}
            >
              {t.nom}
            </button>
          ))}
        </div>
      )}

      {d.erreur ? (
        <p className="text-sm bg-red-900/20 border-l-2 border-red-500 px-3 py-2 text-red-200">
          Impossible de charger les affiliés ({d.erreur}). Si c&apos;est la première fois, la section n&apos;est peut-être pas encore activée.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
            <Stat k={`Affiliés — ${equipe?.nom ?? ""}`} v={String(d.affilies.length)} />
            <Stat k="Rappels pour un match" v={String(nbMatch)} />
            <Stat k="Rappels pour une pratique" v={String(nbPratique)} accent />
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {(["tous", "G", "D", "A"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltre(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs ${filtre === f ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-800 text-slate-400 border border-ink-700"}`}
              >
                {f === "tous" ? "Tous" : GROUPES.find((g) => g.id === f)!.titre}
              </button>
            ))}
            <input className="input max-w-[220px] py-1.5 text-sm" placeholder="Chercher un joueur…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </div>

          {d.loading && <p className="text-slate-400">Chargement...</p>}
          {!d.loading && d.affilies.length === 0 && <p className="text-slate-500 text-sm">Aucun affilié enregistré pour cette équipe.</p>}

          {GROUPES.map((g) => {
            const joueurs = visibles.filter((a) => groupeDe(a.position) === g.id);
            if (!joueurs.length) return null;
            return (
              <section key={g.id} className="space-y-3">
                <h2 className="text-xs uppercase tracking-wide text-slate-400">{g.titre} — {joueurs.length}</h2>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {joueurs.map((a) => (
                    <CarteAffilie key={a.id} a={a} rappels={rappelsParJoueur[a.id] ?? []} noms={d.noms} onRappeler={() => setRappeler(a)} />
                  ))}
                </div>
              </section>
            );
          })}

          <section className="space-y-3">
            <h2 className="text-xs uppercase tracking-wide text-slate-400">Journal des rappels — {d.rappels.length}</h2>
            {d.rappels.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucun rappel enregistré.</p>
            ) : (
              <div className="overflow-x-auto border border-ink-700 rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-700 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 text-left">Événement</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Joueur</th>
                      <th className="px-3 py-2 text-left">Détail</th>
                      <th className="px-3 py-2 text-left">Rappelé par</th>
                      <th className="px-3 py-2 text-left">Enregistré</th>
                      <th className="px-3 py-2 text-left">Alerte direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rappels.map((r) => (
                      <tr key={r.id} className="border-t border-ink-700">
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{fdateLong(r.event_date)}</td>
                        <td className="px-3 py-2">{r.event_type === "match" ? "Match" : "Pratique"}</td>
                        <td className="px-3 py-2 font-semibold">{d.affilies.find((a) => a.id === r.affiliate_id)?.nom ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-400">{[r.event_label, r.note].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-3 py-2">{r.called_by ? d.noms[r.called_by] ?? "—" : "—"}</td>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="px-3 py-2">
                          {r.alert_sent_at ? (
                            <span className="text-green-400">Envoyée</span>
                          ) : (
                            <span className="text-amber-400" title={r.alert_error ?? ""}>Non envoyée</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {rappeler && (
        <ModalRappel
          a={rappeler}
          equipe={equipe?.nom ?? ""}
          matchs={d.matchs}
          rappels={rappelsParJoueur[rappeler.id] ?? []}
          onClose={() => setRappeler(null)}
          onDone={() => d.recharger()}
        />
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

function CarteAffilie({ a, rappels, noms, onRappeler }: { a: Affilie; rappels: Rappel[]; noms: Record<string, string>; onRappeler: () => void }) {
  const [histo, setHisto] = useState(false);
  const dernier = rappels[0];
  const cursus = [a.division, a.classe].filter(Boolean).join(" ");
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{a.nom}</div>
          <div className="text-xs text-slate-400">{naissance(a.date_naissance)}</div>
        </div>
        {a.position && <span className={`badge ${couleurPosition[a.position]}`}>{a.position}</span>}
      </div>

      <div className="text-xs space-y-0.5">
        <div><span className="text-slate-500">Provenance : </span>{a.provenance ?? "—"}</div>
        <div><span className="text-slate-500">Niveau : </span>{[cursus, a.ligue].filter(Boolean).join(" · ") || "—"}</div>
      </div>

      <div className="text-xs space-y-0.5">
        {a.emails.map((e) => (
          <div key={e} className="truncate"><a href={`mailto:${e}`} className="text-gold-400 hover:underline">{e}</a></div>
        ))}
        {a.telephones.map((t) => (
          <div key={t}><a href={`tel:${t.replace(/[^\d+]/g, "")}`} className="text-gold-400 hover:underline">{t}</a></div>
        ))}
        {!a.emails.length && !a.telephones.length && <div className="text-slate-500">Aucun contact au dossier.</div>}
      </div>

      {a.notes && <p className="text-xs bg-amber-900/20 border-l-2 border-amber-500 px-2 py-1 text-amber-200">{a.notes}</p>}

      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-ink-700">
        <div className="text-[11px] text-slate-400 flex-1">
          {dernier ? `Dernier rappel : ${fdate(dernier.event_date)} (${dernier.event_type})` : "Jamais rappelé"}
        </div>
        {rappels.length > 0 && (
          <button onClick={() => setHisto((h) => !h)} className="text-[11px] text-slate-300 underline">
            Historique ({rappels.length})
          </button>
        )}
        <button onClick={onRappeler} className="btn text-xs py-1.5 px-3">Rappeler</button>
      </div>

      {histo && (
        <ul className="text-[11px] text-slate-300 space-y-1">
          {rappels.map((r) => (
            <li key={r.id}>
              {fdate(r.event_date)} — {r.event_type === "match" ? "Match" : "Pratique"}
              {r.event_label && r.event_type === "match" ? ` ${r.event_label}` : ""}
              {r.called_by ? ` · par ${noms[r.called_by] ?? "?"}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModalRappel({
  a, equipe, matchs, rappels, onClose, onDone,
}: {
  a: Affilie;
  equipe: string;
  matchs: MatchOption[];
  rappels: Rappel[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<"match" | "pratique">("match");
  const [gameId, setGameId] = useState("");
  const [date, setDate] = useState(aujourdhui());
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  const aVenir = matchs.filter((m) => m.date >= aujourdhui());
  const dateEffective = type === "match" && gameId ? matchs.find((m) => m.id === gameId)?.date ?? date : date;
  const doublon = rappels.some((r) => r.event_date === dateEffective && r.event_type === type);

  async function enregistrer() {
    setEnvoi(true);
    setResultat(null);
    const res = await fetch("/api/affilies/rappel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affiliateId: a.id, type, date: dateEffective, gameId: type === "match" && gameId ? gameId : null, note }),
    });
    const data = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      setResultat({ ok: false, texte: data.error || "Échec de l'enregistrement." });
      return;
    }
    onDone();
    setResultat({
      ok: true,
      texte: data.emailSent
        ? "Rappel enregistré — alerte envoyée à la direction."
        : `Rappel enregistré, mais l'alerte courriel n'a pas pu partir (${data.reason ?? "erreur inconnue"}). Préviens la direction.`,
    });
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-lg leading-tight">Rappeler {a.nom}</h3>
          <p className="text-xs text-slate-500">{equipe} · provenance : {a.provenance ?? "—"}</p>
        </div>

        {resultat?.ok ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700">{resultat.texte}</p>
            <button onClick={onClose} className="btn w-full">Fermer</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {(["match", "pratique"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-md py-2 text-sm border ${type === t ? "bg-gold-500 text-ink-900 font-semibold border-gold-500" : "bg-white text-slate-600 border-slate-300"}`}
                >
                  {t === "match" ? "Pour un match" : "Pour une pratique"}
                </button>
              ))}
            </div>

            {type === "match" && (
              <div>
                <label className="label">Match</label>
                <select className="input" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                  <option value="">— Autre match (choisir la date) —</option>
                  {aVenir.map((m) => (
                    <option key={m.id} value={m.id}>
                      {fdate(m.date)} {m.heure ?? ""} — {m.libelle}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!(type === "match" && gameId) && (
              <div>
                <label className="label">Date de {type === "match" ? "match" : "pratique"}</label>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}

            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Ex. : heure de pratique, blessure au gardien…" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {doublon && <p className="text-xs text-amber-700">Ce joueur est déjà rappelé pour cette date ({type}).</p>}
            {resultat && !resultat.ok && <p className="text-sm text-red-600">{resultat.texte}</p>}

            <p className="text-[11px] text-slate-500">La direction reçoit une alerte courriel avec la date, le type et les informations du joueur.</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
              <button onClick={enregistrer} disabled={envoi || !dateEffective} className="btn flex-1">
                {envoi ? "Enregistrement…" : "Enregistrer le rappel"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
