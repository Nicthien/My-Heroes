# Pistes d'amélioration — My Heroes

> Bilan établi le 2026-05-19 via un check projet (lint, typecheck, scripts de validation).
> Aucune modification de code n'a été faite. Ce document sert de référence pour des travaux futurs.

## État de santé du socle

| Vérification | Résultat |
|---|---|
| `npm run lint` (ESLint) | ✅ Aucun problème |
| `tsc --noEmit` (TypeScript) | ✅ Aucune erreur |
| `npm run validate:combat` | ✅ Passé |
| `npm run validate:movement` | ✅ Passé |
| `npm run validate:rmg` | ✅ Passé (12 warnings non-bloquants) |
| Migration `add_gates.sql` vs `schema.sql` | ✅ Cohérents |

Le socle est sain. Les points ci-dessous sont des améliorations, pas des régressions.

---

## 🔴 Priorité haute — Hygiène du dépôt

Fichiers temporaires non suivis à risque d'être committés par erreur :

- [ ] `tmp-gate-sources-contact.png` (~300 Ko, racine du projet) — fichier de travail à supprimer
- [ ] `supabase/snippets/Untitled query 662.sql` — snippet SQL non nommé
- [ ] Sprites de test dans `public/assets/sprites/map/` :
  - `gate-test-down-a.webp`
  - `gate-test-down-b.webp`
  - `gate-test-up-a.webp`
  - `gate-test-up-b.webp`

**Actions proposées :**
- Ajouter `tmp-*` et `supabase/snippets/` au `.gitignore`
- Supprimer les sprites `gate-test-*` une fois le sprite final retenu (`gate.webp`, `gate-diagonal-up/down.webp`)

---

## 🟠 Priorité moyenne — Qualité du code

### Fichiers volumineux à découper

| Fichier | Lignes | Note |
|---|---|---|
| `src/lib/rendering/phaser/PhaserMapRenderer.ts` | 4875 | Monolithique — extraire fog of war, élévation, gestion des objets |
| `src/components/game/hud/HUD.tsx` | 2665 | Découper en sous-panneaux |
| `src/components/game/combat/CombatScreen.tsx` | 2540 | Séparer logique combat / rendu |
| `src/app/api/games/[id]/action/route.ts` | 1436 | Un seul handler pour toutes les actions — extraire un handler par type d'action |

### Typage

- [ ] Remplacer les `as any` / `: any` restants (notamment `src/app/api/games/[id]/combats/route.ts`, `src/lib/game/combat/persistent.ts`) par des types explicites lors des prochaines retouches de ces zones.

### Logging

- [ ] `console.error` direct dans `src/app/api/games/[id]/action/route.ts` (3 occurrences, lignes ~218, ~512, ~730). Acceptable pour du debug serveur ; envisager un logger structuré à terme.

---

## 🟡 Observations / surveillance

### Feature « gates » (en cours)

Travail non committé cohérent sur ~1150 lignes : migration, schéma, types AI (`src/lib/game/ai/types.ts`), API et renderer.
- [ ] Committer par lots logiques une fois la feature stabilisée.

### Sécurité Supabase (RLS)

- Seule la table `profiles` a le Row Level Security activé. Les tables de jeu (dont `gates`) reposent sur l'accès service-role via les routes API.
- C'est cohérent avec le design existant, **mais** : tout endpoint mal protégé expose directement les données. À garder en tête si une logique d'accès client direct est ajoutée un jour.

### Warnings du générateur de cartes (RMG)

- Densité de décor faible (~10 %) sur les maps `archipelago` (2p/3p/4p, tailles 72 et 108).
- Ratio d'eau élevé (58 %) sur `jebus-cross 3p 36`.
- Non-bloquant, mais envisager un ajustement des seuils de décor/eau pour ces templates si le gameplay s'en ressent.

---

## Suivi

- [ ] Hygiène dépôt
- [ ] Découpage `PhaserMapRenderer.ts`
- [ ] Découpage `action/route.ts`
- [ ] Nettoyage des `any`
- [ ] Réglage seuils RMG (archipelago / jebus-cross)
