"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Crest from "@/components/Crest";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("Courriel ou mot de passe invalide.");
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
          <label className="label">Courriel</label>
          <input
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Mot de passe</label>
          <input
            type="password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn w-full" disabled={loading}>
          {loading ? "Connexion..." : "Entrer"}
        </button>
        <p className="text-xs text-slate-400">Pas de compte ? Demande à la direction de t&apos;inviter.</p>
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
