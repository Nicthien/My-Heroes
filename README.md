# My Heroes

**Français** · [English](README.en.md)

Jeu video de strategie fantastique au tour par tour.

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

## Déploiement self-hosté (Unraid / Docker)

L'image Docker est **générique** : aucune URL ni clé n'est compilée dedans. Toute
la configuration est lue **au runtime** depuis l'environnement du conteneur, donc
la même image publique (`nicthien/my-heroes` sur Docker Hub) fonctionne pour
n'importe qui, avec ses propres valeurs.

```bash
docker run -d --name my-heroes -p 3000:3000 \
  -e SUPABASE_URL="http://<supabase-host>:8000" \
  -e SUPABASE_ANON_KEY="<anon / publishable key>" \
  -e SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
  -e SUPABASE_INTERNAL_URL="http://<supabase-host>:8000" \
  nicthien/my-heroes:latest
```

Le conteneur ne lance que le frontend Next.js : un backend Supabase doit déjà
tourner. **Guide Unraid complet (Supabase self-hosté + template Unraid + IP
dédiées) : [`docs/UNRAID.md`](docs/UNRAID.md).** Packaging : [`Dockerfile`](Dockerfile),
[`RELEASE.md`](RELEASE.md).

## Variables d'environnement (runtime)

| Variable | Requis | Description |
|----------|--------|-------------|
| `SUPABASE_URL` | oui | URL Supabase côté navigateur. Une valeur privée/LAN active le proxy `/api/supabase`. |
| `SUPABASE_ANON_KEY` | oui | Clé anon / publishable (publique par nature). |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Clé service role, serveur uniquement. |
| `SUPABASE_INTERNAL_URL` | non | Où le serveur joint Supabase. Défaut : `SUPABASE_URL`. |

> En local, `npm run dev` injecte automatiquement la config depuis
> `supabase status` (via les noms `NEXT_PUBLIC_*` du `.env`, conservés comme
> fallback de dev).

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
