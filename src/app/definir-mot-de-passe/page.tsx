"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Crest from "@/components/Crest";

// Page d'atterrissage des liens d'invitation Supabase. Le client navigateur
// @supabase/ssr récupère automatiquement la session depuis l'URL
// (detectSessionInUrl) — on attend juste qu'une session apparaisse, puis on
// laisse la personne choisir son mot de passe.
// Le lien peut être expiré ou déjà utilisé (ouvert deux fois, ou un ancien
// courriel après un renvoi) — sans limite de temps, un lien mort laissait la
// page tourner sur « Vérification... » indéfiniment.
const SESSION_TIMEOUT_MS = 10_000;

export default function DefinirMotDePassePage() {
  const supabase = createClient();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const urlErrorDescription = hashParams.get("error_description") || searchParams.get("error_description");
    if (urlErrorDescription) {
      setLinkError(decodeURIComponent(urlErrorDescription.replace(/\+/g, " ")));
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const timeout = window.setTimeout(() => {
      setReady((already) => {
        if (!already) {
          setLinkError("Ce lien n'a pas pu être vérifié — il est probablement expiré ou déjà utilisé.");
        }
        return already;
      });
    }, SESSION_TIMEOUT_MS);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-4">
      <div className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3">
          <Crest className="h-11 w-11" />
          <h1 className="text-lg font-bold text-ink-900 leading-tight">Bienvenue chez les As</h1>
        </div>

        {linkError ? (
          <div className="space-y-1.5">
            <p className="text-sm text-red-600">{linkError}</p>
            <p className="text-sm text-slate-500">
              Demande à la direction de te renvoyer l&apos;invitation, puis utilise le lien du courriel le plus
              récent.
            </p>
          </div>
        ) : !ready ? (
          <p className="text-sm text-slate-500">Vérification de l&apos;invitation...</p>
        ) : done ? (
          <p className="text-sm text-green-700">Mot de passe enregistré, redirection...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-500">Choisis un mot de passe pour ton compte.</p>
            <div>
              <label className="label">Nouveau mot de passe</label>
              <input
                type="password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Confirmer le mot de passe</label>
              <input
                type="password"
                required
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn w-full" disabled={saving}>
              {saving ? "Enregistrement..." : "Activer mon compte"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
