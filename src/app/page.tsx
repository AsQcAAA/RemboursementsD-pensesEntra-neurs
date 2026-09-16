"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStaff } from "@/lib/useStaff";
import { useDonneesEquipe, type GameRow, type TournamentRow } from "@/lib/donnees";
import { calcMatch, calcTournoi, matchRemboursable, money, km, fdate, fdateLong, periodeDe, PERIODES, PER_DIEM_TOURNOI, JOURS_PEDAGOGIQUES_CHEVALIERS } from "@/lib/calc";
import { ligneDe } from "@/lib/rapports";

type Filtre = "tous" | (typeof PERIODES)[number]["id"];
type Element = { type: "match"; date: string; heure: string; per: string; g: GameRow } | { type: "tournoi"; date: string; per: string; t: TournamentRow };

export default function CalendrierPage() {
  const router = useRouter();
  const { equipesVisibles, isDirection, me, loading: loadingStaff } = useStaff();
  const [teamId, setTeamId] = useState<string | null>(null);
  const teamIdEffectif = teamId ?? equipesVisibles[0]?.id ?? null;
  const equipe = equipesVisibles.find((t) => t.id === teamIdEffectif);
  const lectureSeule =
    !isDirection && !me?.memberships.some((m) => m.team_id === teamIdEffectif && m.portee === "titulaire");
  const d = useDonneesEquipe(teamIdEffectif);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [open, setOpen] = useState<string | null>(null);

  const elements: Element[] = useMemo(() => {
    const matchs: Element[] = d.games
      .filter((g) => matchRemboursable(g, d.venues[g.venueId] ?? { km: 0 } as never))
      .map((g) => ({ type: "match", date: g.date, heure: g.heure ?? "", per: periodeDe(g.date).id, g }));
    const tournois: Element[] = d.tournaments.map((t) => {
      const dt = t.jours[0]?.date ?? "2027-04-30";
      return { type: "tournoi", date: dt, per: periodeDe(dt).id, t };
    });
    return [...matchs, ...tournois].sort((a, b) => (a.date === b.date ? (("heure" in a ? a.heure : "") < ("heure" in b ? b.heure : "") ? -1 : 1) : a.date < b.date ? -1 : 1));
  }, [d.games, d.tournaments, d.venues]);

  const liste = filtre === "tous" ? elements : elements.filter((e) => e.per === filtre);

  if (loadingStaff) return <p className="text-slate-400">Chargement...</p>;
  if (!teamIdEffectif) return <p className="text-slate-400">Aucune équipe ne t&apos;est rattachée.</p>;

  const organisation = (equipe?.organisation ?? "As") as "As" | "Chevaliers";
  const matchsRembo = elements.filter((e) => e.type === "match").length;
  const remplis = elements.filter(
    (e) => e.type === "match" && e.g.claim && calcMatch(e.g, d.venues[e.g.venueId], e.g.claim, organisation).total > 0
  ).length;
  const totalEquipe = ligneDe(
    { team: equipe!, games: d.games, tournaments: d.tournaments, venues: d.venues, staff: d.staffAll, teamStaff: d.teamStaff }
  ).total;

  return (
    <div className="space-y-6">
      {equipesVisibles.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {equipesVisibles.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTeamId(t.id); setOpen(null); }}
              className={`badge ${t.id === teamIdEffectif ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-700 text-slate-200"}`}
            >
              {t.nom}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
        <Stat k="Matchs remboursables" v={String(matchsRembo)} />
        <Stat k="Tournois" v={String(d.tournaments.length)} />
        <Stat k="Matchs remplis" v={`${remplis} / ${matchsRembo}`} />
        <Stat k="Total réclamé" v={money(totalEquipe)} accent />
      </div>

      <div className="flex gap-2 flex-wrap">
        <FiltrePill actif={filtre === "tous"} onClick={() => setFiltre("tous")}>Tout le calendrier</FiltrePill>
        {PERIODES.map((p) => (
          <FiltrePill key={p.id} actif={filtre === p.id} onClick={() => setFiltre(p.id)}>
            {p.court} · {p.mois.split(" · ")[0].toLowerCase()}…
          </FiltrePill>
        ))}
      </div>

      <div className="border border-ink-700 rounded-lg overflow-hidden bg-ink-800">
        {liste.length === 0 && <p className="p-8 text-center text-slate-500 text-sm">Aucun élément dans ce filtre.</p>}
        {liste.map((e, i) => {
          const suivant = liste[i + 1];
          const finPeriode = !suivant || suivant.per !== e.per;
          const staffNoms = d.teamStaff.map((ts) => ({ ...ts, nom: d.staffAll.find((s) => s.id === ts.staff_id)?.full_name ?? "?" }));

          if (e.type === "match") {
            const g = e.g;
            return (
              <div key={g.id}>
                <LigneMatch g={g} venue={d.venues[g.venueId]} organisation={organisation} ouvert={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} />
                {open === g.id && (
                  <EditeurMatch
                    g={g}
                    venue={d.venues[g.venueId]}
                    staff={staffNoms}
                    organisation={organisation}
                    lectureSeule={lectureSeule}
                    onSave={(patch) => d.sauverClaimMatch(g.id, patch)}
                    onClear={() => d.effacerClaimMatch(g.id)}
                  />
                )}
                {finPeriode && <BandeauPeriode perId={e.per} teamId={teamIdEffectif} d={d} lectureSeule={lectureSeule} onReviser={() => router.push("/rapports")} />}
              </div>
            );
          }
          const t = e.t;
          return (
            <div key={t.id}>
              <LigneTournoi t={t} ouvert={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
              {open === t.id && (
                <EditeurTournoi t={t} staff={staffNoms} lectureSeule={lectureSeule} onSave={(patch) => d.sauverClaimTournoi(t.id, patch)} />
              )}
              {finPeriode && <BandeauPeriode perId={e.per} teamId={teamIdEffectif} d={d} lectureSeule={lectureSeule} onReviser={() => router.push("/rapports")} />}
            </div>
          );
        })}
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

function FiltrePill({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-xs ${actif ? "bg-gold-500 text-ink-900 font-semibold" : "bg-ink-800 text-slate-400 border border-ink-700"}`}>
      {children}
    </button>
  );
}

function LigneMatch({
  g, venue, organisation, ouvert, onToggle,
}: {
  g: GameRow;
  venue: ReturnType<typeof useDonneesEquipe>["venues"][string];
  organisation: "As" | "Chevaliers";
  ouvert: boolean;
  onToggle: () => void;
}) {
  const c = calcMatch(g, venue, g.claim, organisation);
  const libelle = (g.domicile ? "vs " : "@ ") + g.adversaire;
  return (
    <button onClick={onToggle} className={`w-full text-left flex items-center gap-3 px-4 py-3 border-t border-ink-700 first:border-t-0 hover:bg-ink-700/50 ${ouvert ? "bg-ink-700/50" : ""}`}>
      <div className={`w-1 self-stretch rounded ${c.total > 0 ? "bg-green-500" : c.autocar ? "bg-sky-400" : "bg-gold-500"}`} />
      <div className="font-mono text-xs text-slate-400 w-24 shrink-0">
        <div className="text-slate-200">{fdate(g.date)}</div>
        <div>{g.heure ?? ""}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{libelle}</div>
        <div className="text-xs text-slate-500 truncate">
          {venue?.nom}, {venue?.ville} · {km(venue?.km ?? 0)} aller
          {c.autocar ? " · +2h de route" : c.kmFacturables > 0 ? ` · ${km(c.kmFacturables)} facturables` : ""}
          {c.autocar && g.busDepartureNote ? ` · départ ${g.busDepartureNote}` : c.autocar ? " · départ à confirmer" : ""}
          {g.horsConcours ? " · hors-concours" : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono text-sm ${c.total > 0 ? "text-gold-400" : "text-slate-500"}`}>{c.total > 0 ? money(c.total) : "à remplir"}</div>
      </div>
    </button>
  );
}

function LigneTournoi({ t, ouvert, onToggle }: { t: TournamentRow; ouvert: boolean; onToggle: () => void }) {
  const c = calcTournoi(t, t.claim);
  const d0 = t.jours[0]?.date;
  const dn = t.jours[t.jours.length - 1]?.date;
  return (
    <button onClick={onToggle} className={`w-full text-left flex items-center gap-3 px-4 py-3 border-t border-ink-700 hover:bg-ink-700/50 ${ouvert ? "bg-ink-700/50" : ""}`}>
      <div className={`w-1 self-stretch rounded bg-gold-500`} />
      <div className="font-mono text-xs text-slate-400 w-24 shrink-0">
        {d0 ? (
          <>
            <div className="text-slate-200">{fdate(d0)}</div>
            <div>→ {dn ? fdate(dn) : ""}</div>
          </>
        ) : (
          <div className="text-slate-200">à dater</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-gold-400 truncate">{t.nom}</div>
        <div className="text-xs text-slate-500 truncate">
          {t.ville} {t.exterieur ? "" : "· local, aucun per diem"} {t.optionnel && !t.debut ? "· en option" : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono text-sm ${c.total > 0 ? "text-gold-400" : "text-slate-500"}`}>{c.total > 0 ? money(c.total) : t.debut ? "à remplir" : "—"}</div>
      </div>
    </button>
  );
}

function EditeurMatch({
  g, venue, staff, organisation, lectureSeule, onSave, onClear,
}: {
  g: GameRow;
  venue: ReturnType<typeof useDonneesEquipe>["venues"][string];
  staff: { staff_id: string; nom: string; titre: string }[];
  organisation: "As" | "Chevaliers";
  lectureSeule: boolean;
  onSave: (patch: { present?: string[]; driver?: string | null }) => void;
  onClear: () => void;
}) {
  const present = g.claim?.present ?? [];
  const driver = g.claim?.driver ?? null;
  const c = calcMatch(g, venue, g.claim, organisation);

  function togglePresent(id: string) {
    const next = present.includes(id) ? present.filter((x) => x !== id) : [...present, id];
    const nextDriver = driver && !next.includes(driver) ? null : driver;
    onSave({ present: next, driver: nextDriver });
  }

  return (
    <div className="bg-black/40 border-t border-ink-700 px-4 py-4 grid md:grid-cols-[1fr_280px] gap-6">
      <div>
        {c.autocar && (
          <p className="text-xs bg-sky-900/30 border-l-2 border-sky-400 px-3 py-2 mb-3 text-sky-200">
            {organisation === "Chevaliers"
              ? `Plus de 200 km aller (${km(venue?.km ?? 0)}) : autobus scolaire.`
              : `Plus de 2h de route (${km(venue?.km ?? 0)}) : autocar de luxe.`}{" "}
            Aucun km, seul le per diem s&apos;applique.
          </p>
        )}
        {organisation === "Chevaliers" && !c.autocar && JOURS_PEDAGOGIQUES_CHEVALIERS.includes(g.date) && (
          <p className="text-xs bg-amber-900/20 border-l-2 border-amber-500 px-3 py-2 mb-3 text-amber-200">
            Journée pédagogique : aucun autobus offert, même au-delà de 200 km — voiture remboursée selon la distance.
          </p>
        )}
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
          Entraîneurs présents — {fdateLong(g.date)}
          {lectureSeule && <span className="badge bg-ink-700 text-slate-400 normal-case">Lecture seule</span>}
        </div>
        <div className="space-y-px rounded-md overflow-hidden border border-ink-700">
          {staff.map((s) => {
            const on = present.includes(s.staff_id);
            return (
              <label key={s.staff_id} className={`flex items-center gap-3 px-3 py-2 text-sm ${on ? "bg-gold-500/10" : "bg-ink-800"} ${lectureSeule ? "opacity-70" : ""}`}>
                <input type="checkbox" checked={on} disabled={lectureSeule} onChange={() => togglePresent(s.staff_id)} className="accent-gold-500" />
                <span className="flex-1">{s.nom}</span>
                <span className="text-[10px] uppercase text-slate-500">{s.titre}</span>
                {c.kmFacturables > 0 && (
                  <label className="flex items-center gap-1 text-[11px] text-slate-400">
                    <input
                      type="radio"
                      name={`drv-${g.id}`}
                      disabled={!on || lectureSeule}
                      checked={driver === s.staff_id}
                      onChange={() => onSave({ driver: s.staff_id })}
                      className="accent-gold-500"
                    />
                    voiture
                  </label>
                )}
              </label>
            );
          })}
        </div>
        {!lectureSeule && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => onSave({ present: staff.map((s) => s.staff_id) })} className="btn-secondary text-xs py-1.5 px-3">Tout le staff</button>
            <button onClick={onClear} className="btn-secondary text-xs py-1.5 px-3">Aucun</button>
          </div>
        )}
      </div>
      <div className="bg-ink-800 border border-ink-700 rounded-md p-4 text-sm h-fit">
        <Ligne label="Distance aller" v={km(venue?.km ?? 0)} />
        <Ligne label="Aller-retour" v={km((venue?.km ?? 0) * 2)} />
        <Ligne label="Franchise" v={km(Math.min(80, (venue?.km ?? 0) * 2))} />
        <Ligne label="Km facturables" v={c.autocar ? "autocar" : km(c.kmFacturables)} />
        <Ligne label="Kilométrage 0,54$/km" v={money(c.kmMontant)} />
        <Ligne label={`Per diem ${c.nb} × 27,50$`} v={money(c.repas)} />
        <div className="flex justify-between items-baseline pt-2 mt-2 border-t border-ink-700">
          <span className="font-semibold text-xs uppercase">Total</span>
          <span className="font-mono text-xl text-gold-400">{money(c.total)}</span>
        </div>
      </div>
    </div>
  );
}

function EditeurTournoi({
  t, staff, lectureSeule, onSave,
}: {
  t: TournamentRow;
  staff: { staff_id: string; nom: string; titre: string }[];
  lectureSeule: boolean;
  onSave: (patch: { km?: number | null; driver?: string | null; presence?: Record<string, string[]> }) => void;
}) {
  const c = calcTournoi(t, t.claim);
  const presence = t.claim?.presence ?? {};

  function togglePresence(date: string, id: string) {
    const jour = presence[date] ?? [];
    const next = jour.includes(id) ? jour.filter((x) => x !== id) : [...jour, id];
    onSave({ presence: { ...presence, [date]: next } });
  }

  return (
    <div className="bg-black/40 border-t border-ink-700 px-4 py-4 space-y-4">
      {t.caseKm ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
            Kilométrage de la fin de semaine — {km(c.kmFacturables)} facturables
          </div>
          <div className="grid sm:grid-cols-[180px_1fr] gap-3 items-end">
            <div>
              <label className="label text-slate-300">Km total parcouru</label>
              <input
                type="number"
                className="input"
                disabled={lectureSeule}
                defaultValue={t.claim?.km ?? ""}
                onBlur={(e) => onSave({ km: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => (
                <label
                  key={s.staff_id}
                  className={`badge ${lectureSeule ? "cursor-default opacity-70" : "cursor-pointer"} ${t.claim?.driver === s.staff_id ? "bg-gold-500 text-ink-900" : "bg-ink-700 text-slate-200"}`}
                >
                  <input
                    type="radio"
                    name={`tdrv-${t.id}`}
                    className="hidden"
                    disabled={lectureSeule}
                    checked={t.claim?.driver === s.staff_id}
                    onChange={() => onSave({ driver: s.staff_id })}
                  />
                  {s.nom}
                </label>
              ))}
            </div>
          </div>
          {c.kmFacturables > 0 && !t.claim?.driver && (
            <p className="text-xs bg-red-900/20 border-l-2 border-red-500 px-3 py-2 mt-2 text-red-200">
              Kilométrage non réclamé. Sélectionnez {t.exterieur ? "le conducteur" : "la personne à qui le montant est payable"}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Aucun kilométrage n&apos;est réclamable pour ce tournoi.</p>
      )}

      {!t.exterieur && (
        <p className="text-xs bg-ink-800 border-l-2 border-sky-400 px-3 py-2 text-slate-300">
          <b>Tournoi à domicile.</b> Aucun per diem, aucune présence à relever.
        </p>
      )}

      {t.exterieur &&
        t.jours.map((j) => {
          const n = (presence[j.date] ?? []).length;
          return (
            <div key={j.date} className="border-t border-ink-700 pt-3">
              <div className="flex items-baseline gap-2 mb-2">
                <b className="text-sm">{fdateLong(j.date)}</b>
                <span className={`badge ${j.statut === "office" ? "bg-ink-700 text-slate-300" : "bg-sky-900/40 text-sky-200"}`}>
                  {j.statut === "office" ? "Incluse d'office" : "En option"}
                </span>
                <span className="flex-1" />
                <span className="font-mono text-xs text-slate-400">
                  {n} présent{n > 1 ? "s" : ""} · {money(n * PER_DIEM_TOURNOI)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {staff.map((s) => {
                  const on = (presence[j.date] ?? []).includes(s.staff_id);
                  return (
                    <label
                      key={s.staff_id}
                      className={`badge ${lectureSeule ? "cursor-default opacity-70" : "cursor-pointer"} ${on ? "bg-gold-500/20 text-gold-300 border border-gold-700" : "bg-ink-700 text-slate-300"}`}
                    >
                      <input type="checkbox" className="hidden" disabled={lectureSeule} checked={on} onChange={() => togglePresence(j.date, s.staff_id)} />
                      {s.nom}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

      <div className="bg-ink-800 border border-ink-700 rounded-md p-4 text-sm">
        <Ligne label={`Kilométrage — ${km(c.kmTotal)} moins la franchise`} v={money(c.kmMontant)} />
        <Ligne label={`Per diem — ${c.presences} présence(s)`} v={money(c.repas)} />
        <div className="flex justify-between items-baseline pt-2 mt-2 border-t border-ink-700">
          <span className="font-semibold text-xs uppercase">Total tournoi</span>
          <span className="font-mono text-xl text-gold-400">{money(c.total)}</span>
        </div>
      </div>
    </div>
  );
}

function Ligne({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-ink-700 last:border-0 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

function BandeauPeriode({
  perId, teamId, d, lectureSeule, onReviser,
}: {
  perId: string;
  teamId: string;
  d: ReturnType<typeof useDonneesEquipe>;
  lectureSeule: boolean;
  onReviser: () => void;
}) {
  const [envoi, setEnvoi] = useState<"idle" | "envoi" | string>("idle");
  const per = PERIODES.find((p) => p.id === perId);
  if (!per) return null;
  const R = ligneDe({ team: { id: teamId, nom: "", organisation: "" }, games: d.games, tournaments: d.tournaments, venues: d.venues, staff: d.staffAll, teamStaff: d.teamStaff }, per.id);
  const periodeId = per.id;

  async function envoyer() {
    setEnvoi("envoi");
    const res = await fetch("/api/envoyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, periode: periodeId }),
    });
    const data = await res.json().catch(() => ({}));
    setEnvoi(res.ok ? "Envoyé." : data.error || "Échec de l'envoi.");
  }

  return (
    <div className="flex items-center gap-4 flex-wrap px-4 py-3 bg-gradient-to-r from-gold-900/30 to-transparent border-y border-gold-700/40">
      <div className="min-w-[180px]">
        <b className="block text-sm uppercase tracking-wide">Fin du {per.nom.toLowerCase()}</b>
        <span className="text-xs text-slate-400">{per.mois} — à remettre {per.remis}</span>
      </div>
      <div className="text-xs text-slate-400">{R.lignes.length} déplacement(s) réclamé(s)</div>
      <div className="flex-1" />
      <div className="font-mono text-lg text-gold-400">{money(R.total)}</div>
      <button onClick={onReviser} className="btn-secondary text-xs py-1.5 px-3">Réviser le rapport</button>
      {!lectureSeule && (
        <button onClick={envoyer} disabled={!R.total || envoi === "envoi"} className="btn text-xs py-1.5 px-3">
          {envoi === "envoi" ? "…" : "Enregistrer et envoyer"}
        </button>
      )}
      {envoi !== "idle" && envoi !== "envoi" && <span className="text-xs text-slate-400 w-full">{envoi}</span>}
    </div>
  );
}
