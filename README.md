# My Heroes

Jeu video de strategie au tour par tour inspire de **Heroes of Might and Magic III**.

## Description

My Heroes est un jeu de strategie au tour par tour ou les joueurs explorent une carte, collectent des ressources, recrutent des heros et des armees, et affrontent leurs adversaires dans des batailles tactiques. Le projet est construit avec Next.js, Supabase et Phaser.

## Prerequis

- Node.js 20.9+
- Docker Desktop ouvert, pour Supabase local
- npm

## Installation

1. Installer les dependances :
   ```bash
   npm install
   ```

2. Lancer l'environnement de developpement :
   ```bash
   npm run dev
   ```
   Cette commande demarre Supabase local, recupere ses variables et lance Next.js.

3. Ouvrir [http://localhost:3000](http://localhost:3000).

Supabase Studio est disponible sur [http://127.0.0.1:56023](http://127.0.0.1:56023).

## Commandes utiles

```bash
npm run dev:web       # Lance seulement Next.js
npm run dev:supabase  # Lance seulement Supabase local
npm run db:reset      # Recree la base locale avec les migrations
npm run dev:stop      # Arrete Supabase local
npm run test:e2e:gameplay # Lance Supabase local, seed un user E2E, puis teste un vrai parcours de partie
```

Le schema local est versionne dans [`supabase/migrations`](supabase/migrations). Le fichier
[`supabase/schema.sql`](supabase/schema.sql) reste utile pour appliquer le schema dans un projet
Supabase cloud via le SQL Editor.

## Déploiement Docker sur Unraid (un conteneur)

1. Depuis le dossier `docker`, crée un fichier `.env` (non versionné) basé sur `.env.example`.
2. Remplis les variables Supabase de production.
3. Lance le conteneur :

```bash
cd docker
docker compose up -d --build
```

4. L'application est accessible sur `http://<IP_UNRAID>:3000`.

Notes importantes:
- Le conteneur lance uniquement le frontend Next.js. Un backend Supabase doit être déjà opérationnel.
- `SUPABASE_INTERNAL_URL` n'est utile que si le client doit passer par le proxy `/api/supabase`; sinon, laisser vide.

Variables minimales:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

## Variables d'environnement

Voir [`.env.example`](.env.example) pour la liste des variables requises :

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cle publique/anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Cle service role, serveur uniquement |
| `NEXT_PUBLIC_SITE_URL` | URL publique de l'application |

Ces variables sont surtout utiles pour Supabase cloud ou la production. En local, `npm run dev`
les injecte automatiquement depuis `supabase status`.

## Compte admin local

En local, `npm run dev`, `npm run db:reset`, `npm run admin:ensure` et le seed E2E garantissent
la presence du compte de secours :

- Email : `admin@myheroes.local`
- Pseudo : `Admin`
- Mot de passe : `ChangeMe`

Le profil est marque `must_change_password`, donc l'interface demandera un changement de mot de passe.

## Stack technique

- **Frontend** : Next.js, React, Tailwind CSS
- **Backend** : Next.js Route Handlers, Supabase JS
- **Base de donnees** : Supabase Postgres
- **Authentification** : Supabase Auth
- **Realtime** : Supabase Realtime
- **Rendu carte** : Phaser

## Licence

Projet personnel, tous droits reserves.
