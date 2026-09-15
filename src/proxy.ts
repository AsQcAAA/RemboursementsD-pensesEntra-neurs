import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Verrouille toute l'appli derrière Supabase Auth. Seuls les entraîneurs
// invités (voir /api/inviter, réservé à la direction) peuvent atteindre une
// page — les montants réclamés et les coordonnées d'hébergement n'ont rien
// de public.
const PUBLIC_PATHS = ["/login", "/definir-mot-de-passe"];

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
