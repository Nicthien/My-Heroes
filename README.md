# My Heroes

**Français** · [English](README.en.md)

Jeu video de strategie fantastique au tour par tour.

[![Soutenir sur Ko-fi](https://img.shields.io/badge/Soutenir-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/nthstudio)

Ce jeu est un projet personnel developpe sur mon temps libre. Si il vous plait et que vous souhaitez le soutenir, vous pouvez m'offrir un Ko-fi : [ko-fi.com/nthstudio](https://ko-fi.com/nthstudio). Merci !

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

Pour appliquer automatiquement les migrations de schéma au démarrage, ajoute
`-e SUPABASE_DB_URL="postgresql://postgres:<mot-de-passe>@<supabase-host>:5432/postgres"`
(voir [`docs/UNRAID.md`](docs/UNRAID.md) → « Step 5 », notamment la mise en
service `baseline` la première fois).

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
| `SUPABASE_DB_URL` | non | URL Postgres directe (`postgres` + `POSTGRES_PASSWORD`) pour appliquer les migrations au démarrage. Absente = pas d'auto-migration. Voir [`docs/UNRAID.md`](docs/UNRAID.md) → Step 5. |
| `MIGRATE_ON_BOOT` | non | `false` pour désactiver la migration au démarrage. Défaut : `true`. |
| `USE_SMTP` | non | `true` pour activer l'envoi d'emails (confirmation d'inscription + bienvenue) ; la connexion reste bloquée tant que l'adresse n'est pas confirmée. Défaut : `false` (inscription instantanée, aucun email). |
| `APP_PUBLIC_URL` | si SMTP | URL publique de l'app (ex. `https://myheroes.exemple.fr`), utilisée pour construire les liens de confirmation. |
| `SMTP_HOST` | si SMTP | Hôte du serveur SMTP. |
| `SMTP_PORT` | non | Port SMTP. Défaut : `587`. |
| `SMTP_SECURE` | non | `true` pour TLS implicite (port 465), `false` pour STARTTLS (587/25). Défaut : `false`. |
| `SMTP_USER` | si SMTP | Identifiant SMTP. |
| `SMTP_PASS` | si SMTP | Mot de passe SMTP. |
| `SMTP_FROM` | si SMTP | En-tête `From`, ex. `My Heroes <no-reply@exemple.fr>`. |

> En local, `npm run dev` injecte automatiquement la config depuis
> `supabase status` (via les noms `NEXT_PUBLIC_*` du `.env`, conservés comme
> fallback de dev).

## Compte admin

Un compte admin est **créé automatiquement au premier démarrage** du serveur (sur
toute installation), s'il n'existe pas déjà :

- Email : `admin@myheroes.local`
- Pseudo : `Admin`
- Mot de passe : `ChangeMe`

⚠️ **C'est un compte de gestion serveur uniquement — il ne peut pas jouer.** Il
peut administrer et observer les parties, mais **ne peut pas rejoindre une partie
comme joueur** (l'API renvoie un 403 à la tentative de jointure, et créer une
partie en admin ne l'inscrit pas comme joueur).

Le profil est marqué `must_change_password`, donc l'interface impose de changer le
mot de passe à la première connexion. La création est **idempotente** (un compte
existant n'est jamais écrasé).

Personnalisation par variables d'environnement : `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`ADMIN_NAME`, et `ADMIN_SEED_DISABLED=1` pour désactiver complètement le seed. En
local, `npm run admin:ensure` fait la même chose à la demande.

## Stack technique

- **Frontend** : Next.js, React, Tailwind CSS
- **Backend** : Next.js Route Handlers, Supabase JS
- **Base de donnees** : Supabase Postgres
- **Authentification** : Supabase Auth
- **Realtime** : Supabase Realtime
- **Rendu carte** : Phaser

## Licence

Projet personnel, tous droits reserves.
