"use client";

import { useState } from "react";
import { useStaff } from "@/lib/useStaff";
import { useDonneesMultiEquipes } from "@/lib/donnees";
import { ligneDe } from "@/lib/rapports";
import { calcMatch, money, fdateLong } from "@/lib/calc";
import { createClient } from "@/lib/supabase/client";

type Onglet = "tableau" | "inviter" | "logistique";

export default function DirectionPage() {
  const { teams, isDirection, loading: loadingStaff } = useStaff();
  const [onglet, setOnglet] = useState<Onglet>("tableau");
  const teamIds = teams.map((t) => t.id);
  const d = useDonneesMultiEquipes(teamIds);

  if (loadingStaff || d.loading) return <p className="text-slate-400">Chargement...</p>;
  if (!isDirection) return <p className="text-slate-400">Réservé à la direction.</p>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {(
          [
            ["tableau", "Tableau de bord"],
            ["inviter", "Inviter un entraîneur"],
            ["logistique", "Autocars & hôtels"],
          ] as [Onglet, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setOnglet(id)} className={`badge ${onglet === id ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {onglet === "tableau" && <TableauDeBord teams={teams} d={d} />}
      {onglet === "inviter" && <Inviter teams={teams} />}
      {onglet === "logistique" && <Logistique teams={teams} d={d} />}
    </div>
  );
}

function TableauDeBord({ teams, d }: { teams: { id: string; nom: string; organisation: string }[]; d: ReturnType<typeof useDonneesMultiEquipes> }) {
  const rows = teams.map((t) => {
    const donnees = {
      team: t,
      games: d.gamesParEquipe[t.id] ?? [],
      tournaments: d.tournamentsParEquipe[t.id] ?? [],
      venues: d.venues,
      staff: d.staffAll,
      teamStaff: (d.teamStaffParEquipe[t.id] ?? []).map((ts) => ({ staff_id: ts.staff_id, titre: ts.titre })),
    };
    return { t, R: ligneDe(donnees), nbGames: (d.gamesParEquipe[t.id] ?? []).length };
  });
  const grand = rows.reduce((s, r) => s + r.R.total, 0);

  // Détecteur de doubles réclamations : même entraîneur, même jour, équipes différentes.
  const parJour: Record<string, Record<string, string[]>> = {};
  for (const t of teams) {
    for (const g of d.gamesParEquipe[t.id] ?? []) {
      if (!g.claim || calcMatch(g, d.venues[g.venueId], g.claim).total <= 0) continue;
      for (const id of g.claim.present) {
        (parJour[g.date] ??= {});
        (parJour[g.date][id] ??= []).push(t.nom);
      }
    }
  }
  const conflits: { date: string; nom: string; equipes: string[] }[] = [];
  for (const [date, parCoach] of Object.entries(parJour)) {
    for (const [id, equipes] of Object.entries(parCoach)) {
      if (equipes.length > 1) {
        const nom = d.staffAll.find((s) => s.id === id)?.full_name ?? id;
        conflits.push({ date, nom, equipes });
      }
    }
  }
  conflits.sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
        <Stat k="Équipes" v={String(teams.length)} />
        <Stat k="Doubles réclamations" v={String(conflits.length)} warn={conflits.length > 0} />
        <Stat k="Engagement total" v={money(grand)} accent />
      </div>

      <div className="overflow-x-auto border border-ink-700 rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-700 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 text-left">Équipe</th>
              <th className="px-3 py-2 text-left">Organisation</th>
              <th className="px-3 py-2 text-right">Matchs</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id} className="border-t border-ink-700">
                <td className="px-3 py-2 font-semibold">{r.t.nom}</td>
                <td className="px-3 py-2 text-slate-400">{r.t.organisation}</td>
                <td className="px-3 py-2 text-right font-mono">{r.nbGames || "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{money(r.R.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Doubles réclamations — une seule réclamation par entraîneur, par jour</h3>
        {conflits.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun entraîneur n&apos;est réclamé deux fois la même journée.</p>
        ) : (
          <div className="overflow-x-auto border border-ink-700 rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-700 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Entraîneur</th>
                  <th className="px-3 py-2 text-left">Réclamé par</th>
                </tr>
              </thead>
              <tbody>
                {conflits.map((c, i) => (
                  <tr key={i} className="border-t border-ink-700">
                    <td className="px-3 py-2 font-mono">{fdateLong(c.date)}</td>
                    <td className="px-3 py-2 font-semibold">{c.nom}</td>
                    <td className="px-3 py-2 text-amber-400">{c.equipes.join(" + ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v, accent, warn }: { k: string; v: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="bg-ink-800 p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className={`font-mono text-xl mt-1 ${accent ? "text-gold-400" : warn ? "text-amber-400" : "text-white"}`}>{v}</div>
    </div>
  );
}

function Inviter({ teams }: { teams: { id: string; nom: string; organisation: string }[] }) {
  const [mode, setMode] = useState<"connexion" | "adjoint">("connexion");
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [nip, setNip] = useState("");
  const [accessRole, setAccessRole] = useState<"coach" | "direction">("coach");
  const [rattachements, setRattachements] = useState<{ team_id: string; titre: "chef" | "adjoint" | "extra"; portee: "titulaire" | "superviseur" }[]>([]);
  const [envoi, setEnvoi] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  function ajouterRattachement() {
    setRattachements((r) => [...r, { team_id: teams[0]?.id ?? "", titre: mode === "adjoint" ? "adjoint" : "chef", portee: "titulaire" }]);
  }
  function majRattachement(i: number, patch: Partial<(typeof rattachements)[number]>) {
    setRattachements((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function retirerRattachement(i: number) {
    setRattachements((r) => r.filter((_, idx) => idx !== i));
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setEnvoi(null);
    const res = await fetch("/api/inviter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:
        mode === "adjoint"
          ? JSON.stringify({ mode, full_name: nom, memberships: rattachements })
          : JSON.stringify({ mode, email, full_name: nom, nip, access_role: accessRole, memberships: rattachements }),
    });
    setSending(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEnvoi({ kind: "error", text: data.error || "Échec de la création." });
      return;
    }
    setEnvoi({ kind: "ok", text: mode === "adjoint" ? `${nom} ajouté(e).` : `Compte créé pour ${nom} — code d'accès ${nip}.` });
    setEmail("");
    setNom("");
    setNip("");
    setRattachements([]);
  }

  return (
    <form onSubmit={envoyer} className="card max-w-2xl space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("connexion")}
          className={`badge ${mode === "connexion" ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}
        >
          Avec connexion (chef / direction)
        </button>
        <button
          type="button"
          onClick={() => setMode("adjoint")}
          className={`badge ${mode === "adjoint" ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}
        >
          Adjoint / extra (sans connexion)
        </button>
      </div>
      {mode === "adjoint" && (
        <p className="text-xs text-slate-400">
          Personne cochable dans les listes de présence, sans accès au site. Si cette personne est déjà chef d&apos;une
          autre équipe, utilise exactement le même nom — le compte existant sera réutilisé.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Nom complet</label>
          <input required className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        {mode === "connexion" && (
          <div>
            <label className="label">Courriel</label>
            <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}
      </div>
      {mode === "connexion" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Code d&apos;accès (4 chiffres)</label>
            <input
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              className="input font-mono tracking-widest"
              value={nip}
              onChange={(e) => setNip(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <p className="text-xs text-slate-400 mt-1">C&apos;est ce code que la personne utilisera pour se connecter.</p>
          </div>
        </div>
      )}
      {mode === "connexion" && (
        <div>
          <label className="label">Rôle d&apos;accès</label>
          <select className="input" value={accessRole} onChange={(e) => setAccessRole(e.target.value as "coach" | "direction")}>
            <option value="coach">Entraîneur-chef / superviseur</option>
            <option value="direction">Direction</option>
          </select>
        </div>
      )}

      <div>
        <label className="label">Équipe(s)</label>
        <div className="space-y-2">
          {rattachements.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className="input flex-1 min-w-[160px]" value={r.team_id} onChange={(e) => majRattachement(i, { team_id: e.target.value })}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.nom} ({t.organisation})</option>
                ))}
              </select>
              <select className="input w-32" value={r.titre} onChange={(e) => majRattachement(i, { titre: e.target.value as "chef" | "adjoint" | "extra" })}>
                <option value="chef">Chef</option>
                <option value="adjoint">Adjoint</option>
                <option value="extra">Extra</option>
              </select>
              <select className="input w-36" value={r.portee} onChange={(e) => majRattachement(i, { portee: e.target.value as "titulaire" | "superviseur" })}>
                <option value="titulaire">Titulaire</option>
                <option value="superviseur">Superviseur (lecture seule)</option>
              </select>
              <button type="button" onClick={() => retirerRattachement(i)} className="text-red-400 text-sm px-2">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={ajouterRattachement} className="btn-secondary text-xs py-1.5 px-3 mt-2">+ Ajouter une équipe</button>
      </div>

      {envoi && <p className={`text-sm ${envoi.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{envoi.text}</p>}
      <button type="submit" disabled={sending} className="btn">
        {sending ? "Envoi..." : mode === "adjoint" ? "Ajouter" : "Créer le compte"}
      </button>
    </form>
  );
}

function Logistique({ teams, d }: { teams: { id: string; nom: string; organisation: string }[]; d: ReturnType<typeof useDonneesMultiEquipes> }) {
  const supabase = createClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const busGames = teams.flatMap((t) => (d.gamesParEquipe[t.id] ?? []).filter((g) => !g.domicile && d.venues[g.venueId]?.autocar && !g.forcedCar).map((g) => ({ t, g })));

  async function sauverDepart(gameId: string, note: string) {
    setNotes((n) => ({ ...n, [gameId]: note }));
    await supabase.from("games").update({ bus_departure_note: note }).eq("id", gameId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2">Départs d&apos;autocar — {busGames.length} déplacement(s) de plus de 2h</h3>
        <div className="overflow-x-auto border border-ink-700 rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-700 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Équipe</th>
                <th className="px-3 py-2 text-left">Match</th>
                <th className="px-3 py-2 text-left w-56">Heure de départ</th>
              </tr>
            </thead>
            <tbody>
              {busGames.map(({ t, g }) => (
                <tr key={g.id} className="border-t border-ink-700">
                  <td className="px-3 py-2 font-mono">{fdateLong(g.date)}</td>
                  <td className="px-3 py-2">{t.nom}</td>
                  <td className="px-3 py-2 text-slate-400">@ {g.adversaire} — {d.venues[g.venueId]?.ville}</td>
                  <td className="px-3 py-2">
                    <input
                      className="input text-xs py-1.5"
                      placeholder="Ex. : 9h30, Aréna Duberger"
                      defaultValue={g.busDepartureNote ?? ""}
                      onBlur={(e) => sauverDepart(g.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
