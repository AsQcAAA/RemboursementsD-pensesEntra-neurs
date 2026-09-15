// Les entraîneurs se connectent avec le même code d'accès à 4 chiffres que
// l'ancien portail (ex. Jean = 1701) — pas un courriel + mot de passe. Le
// compte Supabase Auth derrière reste réel (email + mot de passe), mais ce
// mot de passe est dérivé du NIP : le préfixe/suffixe ci-dessous n'a rien de
// secret, il sert uniquement à satisfaire la longueur minimale de Supabase
// Auth sans jamais rien demander de plus que les 4 chiffres à la personne.
const PREFIXE = "AsQc-";
const SUFFIXE = "-Rembourse";

export function nipValide(nip: string): boolean {
  return /^\d{4}$/.test(nip);
}

export function nipToPassword(nip: string): string {
  return `${PREFIXE}${nip}${SUFFIXE}`;
}
