"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Crest from "@/components/Crest";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);
  const [staffId, setStaffId] = useState("");
  const [nip, setNip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/coachs")
      .then((r) => r.json())
      .then((data) => {
        setStaff(data.staff ?? []);
        if (data.staff?.[0]) setStaffId(data.staff[0].id);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(nip)) {
      setError("Le code d'accès doit contenir 4 chiffres.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/connexion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, nip }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Nom ou code d'accès invalide.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3">
          <Crest className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-bold text-ink-900 leading-tight">As de Québec — Remboursements</h1>
            <p className="text-xs text-slate-500">Accès réservé aux entraîneurs-chefs et à la direction.</p>
          </div>
        </div>
        <div>
          <label className="label">Entraîneur-chef</label>
          <select className="input" required value={staffId} onChange={(e) => setStaffId(e.target.value)} autoFocus>
            {staff.length === 0 && <option value="">Chargement...</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Code d&apos;accès (4 chiffres)</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={4}
            required
            className="input tracking-widest text-center text-lg font-mono"
            value={nip}
            onChange={(e) => setNip(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn w-full" disabled={loading || !staffId}>
          {loading ? "Connexion..." : "Entrer"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
