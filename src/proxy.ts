import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Verrouille toute l'appli derrière Supabase Auth. Seuls les entraîneurs
// invités (voir /api/inviter, réservé à la direction) peuvent atteindre une
// page — les montants réclamés et les coordonnées d'hébergement n'ont rien
// de public. /api/coachs et /api/connexion doivent rester publics : ce sont
// eux qui alimentent et traitent l'écran de connexion par NIP.
const PUBLIC_PATHS = ["/login", "/api/coachs", "/api/connexion"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(req);

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
