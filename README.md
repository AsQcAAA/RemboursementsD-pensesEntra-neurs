# As de Québec — Remboursements

Portail de remboursement de dépenses pour les entraîneurs des As de Québec AAA et des
Chevaliers de la Seigneurie (10 équipes). Chaque entraîneur-chef coche qui était présent
à un match ou un tournoi, le kilométrage et le per diem se calculent automatiquement, et
le rapport (PDF + courriel) part directement de la plateforme.

Site séparé de l'appli M17 (`as-quebec-m17`) — même palette visuelle et mêmes
plateformes (Supabase, Vercel, Resend), mais sa propre base de données : voir
`/Users/jeangf/.claude/plans/iterative-inventing-map.md` pour le détail de cette
décision.

## 1. Créer le projet Supabase (base de données + authentification)

1. Va sur https://supabase.com → **New project** (compte déjà existant pour l'appli M17).
2. Dans **Project Settings → API**, note :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (garde-le secret)
3. Dans **SQL Editor**, colle et exécute [`supabase/schema.sql`](supabase/schema.sql) —
   crée les tables (équipes, arénas, entraîneurs, calendrier, tournois, réclamations,
   hôtels, rapports) et les politiques RLS.
4. Colle ensuite et exécute [`supabase/seed.sql`](supabase/seed.sql) — pré-remplit les
   10 équipes, ~30 arénas, les 5 calendriers As déjà validés (157+ matchs) et les 23
   tournois de la saison.
5. Dans **Storage**, crée un compartiment nommé exactement `hotel-docs` (non public) —
   les politiques RLS pour ce compartiment sont déjà dans `schema.sql`.
6. Dans **Authentication → Providers**, « Email » doit être activé (par défaut).

## 2. Variables d'environnement

Copie `.env.local.example` vers `.env.local` et remplis les valeurs ci-dessus, plus :

```
RESEND_API_KEY=...            # même compte Resend que l'appli M17
ENVOI_FROM_EMAIL=remboursements@votredomaine.com
```

## 3. Lancer en local

```
npm install
npm run dev
```

## 4. Premier compte (direction)

Les entraîneurs se connectent avec un code d'accès à 4 chiffres (le même que sur
l'ancien portail — Jean = `1701`), pas un mot de passe libre. Le mot de passe
Supabase Auth réel derrière ce code est dérivé du NIP (`src/lib/nip.ts`,
`nipToPassword`) — pas un secret en soi, juste ce qu'il faut pour satisfaire la
longueur minimale de Supabase Auth.

Aucun compte n'existe encore — il faut en créer un manuellement pour la première
personne (toi), le site n'ayant encore personne pour t'inviter :
1. Dans Supabase → **Authentication → Users → Add user**, crée ton compte avec ton
   courriel, et comme mot de passe colle exactement `AsQc-1701-Rembourse` (choisis
   « Auto Confirm User »).
2. Dans **SQL Editor**, insère ta ligne `staff` (remplace l'id par celui de l'utilisateur
   créé, visible dans la liste des utilisateurs) :
   ```sql
   insert into staff (auth_user_id, full_name, email, nip, access_role)
   values ('<uuid-de-l-utilisateur>', 'Jean Grignon-Francke', 'jean.grignonfrancke@asdequebecaaa.com', '1701', 'direction');
   ```
3. Connecte-toi sur le site : choisis ton nom dans la liste, code d'accès `1701`.
4. Une fois connecté, utilise **Direction → Inviter un entraîneur** (mode « Avec
   connexion ») pour créer les 9 autres comptes de chefs/superviseurs — voir
   `scripts/roster-prevu.json` pour le rattachement équipe(s)/rôle et le NIP déjà
   connu de chacun (les courriels réels restent à obtenir). Les adjoints/extras
   (mode « Adjoint / extra ») n'ont besoin que d'un nom. Chaque personne avec
   connexion peut se connecter dès que son compte est créé, sans
   courriel à confirmer ni mot de passe à choisir.

## 5. Déploiement

Connecte le dépôt GitHub à un nouveau projet Vercel (détection Next.js automatique),
ajoute les mêmes variables d'environnement dans **Project Settings → Environment
Variables**, puis déploie.

## Développement

- `src/lib/calc.ts` — toutes les règles de remboursement (kilométrage, franchise,
  autocar, per diem, journées de tournoi). Vérifié par `npx tsx src/lib/calc.test.ts`.
- `src/lib/rapports.ts` — construit les tableaux d'un rapport ; une seule définition,
  utilisée par l'écran, le PDF et le courriel.
- `src/lib/pdf.ts` — génération du PDF (jsPDF + jspdf-autotable, côté serveur).
- `src/app/api/envoyer` — génère le PDF et l'envoie par Resend (pièce jointe).
- `src/app/api/inviter` — crée le compte d'un entraîneur (Supabase Auth, mot de passe
  dérivé de son NIP) et ses rattachements d'équipe.
- `src/app/api/connexion` — connexion par NIP : retrouve le courriel côté serveur à
  partir du nom choisi, puis se connecte avec le mot de passe dérivé du code.
- `src/lib/nip.ts` — transforme un code à 4 chiffres en mot de passe Supabase Auth.
