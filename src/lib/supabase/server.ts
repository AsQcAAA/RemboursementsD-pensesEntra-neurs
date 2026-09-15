import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Next.js 15+ made cookies() async, so this helper is async too.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // Server Components can't set cookies; auth writes happen in Route Handlers.
        },
        remove() {},
      },
    }
  );
}

// Variante utilisable dans un Route Handler (contrairement aux Server
// Components, ceux-ci peuvent écrire des cookies) — nécessaire pour la
// connexion par NIP (/api/connexion), qui doit poser les cookies de session
// Supabase Auth sur la réponse.
export async function createRouteHandlerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );
}

// Client à rôle de service, pour les opérations serveur privilégiées (inviter
// un entraîneur, envoyer un rapport). Contourne complètement les politiques
// RLS — ne jamais l'importer depuis un composant client.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
