# My Heroes

Jeu vidéo de stratégie au tour par tour inspiré de **Heroes of Might and Magic III**.

## Description

My Heroes est un jeu de stratégie au tour par tour où les joueurs explorent une carte, collectent des ressources, recrutent des héros et des armées, et affrontent leurs adversaires dans des batailles tactiques. Le projet est construit avec Next.js, Prisma et PostgreSQL.

## Prérequis

- Node.js 18+
- PostgreSQL 16+
- npm (ou yarn/pnpm)

## Installation

1. Cloner le dépôt :
   ```bash
   git clone https://github.com/<votre-utilisateur>/my-heroes.git
   cd my-heroes
   ```

2. Installer les dépendances :
   ```bash
   npm install
   ```

3. Configurer les variables d'environnement :
   ```bash
   cp .env.example .env
   ```
   Modifier `.env` avec vos propres identifiants de base de données et votre secret NextAuth.

4. Lancer la base de données avec Docker (optionnel) :
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

5. Appliquer les migrations Prisma :
   ```bash
   npx prisma migrate dev
   ```

6. Lancer le serveur de développement :
   ```bash
   npm run dev
   ```

7. Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Variables d'environnement

Voir [`.env.example`](.env.example) pour la liste des variables requises :

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `AUTH_SECRET` | Secret pour NextAuth |
| `NEXTAUTH_URL` | URL de l'application |

## Stack technique

- **Frontend** : Next.js, React, Tailwind CSS
- **Backend** : Next.js API Routes, Prisma ORM
- **Base de données** : PostgreSQL 16
- **Authentification** : NextAuth.js
- **Conteneurisation** : Docker / Docker Compose

## Licence

Projet personnel — tous droits réservés.