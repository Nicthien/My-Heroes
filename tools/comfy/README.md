# Génération d'assets via ComfyUI

Pipeline pour générer des textures/sprites/fonds avec ton ComfyUI local et les intégrer au jeu.

## Ce que tu dois faire (une fois)
1. Dans l'UI ComfyUI (http://127.0.0.1:8000), monte un workflow **texte → image** qui marche
   avec ton modèle disponible (**`z_image_turbo`** — le seul modèle d'image installé ;
   `CheckpointLoaderSimple` est vide, utilise `UNETLoader` + le bon text-encoder/VAE).
2. Dans le **nœud de prompt positif** (le texte), mets le jeton **`__PROMPT__`** à l'endroit où
   tu veux que le prompt soit injecté (l'outil le remplace par `-Prompt`).
3. Assure-toi qu'il y a un nœud **`SaveImage`** en sortie.
4. Menu ComfyUI → **Save (API Format)** → enregistre le JSON ici, p.ex. :
   `tools/comfy/txt2img.api.json`.

## Générer une image
```powershell
pwsh tools/comfy-gen.ps1 `
  -Workflow tools/comfy/txt2img.api.json `
  -Prompt "deep space nebula, purple and teal, distant stars, vast, cinematic, seamless" `
  -Out assets/generated/nebula_bg.png
```
Le PNG arrive dans `assets/` ; je m'occupe ensuite de l'importer dans Godot et de le câbler
(fond de carte, sprites de vaisseaux, cadres d'UI…).

## Notes
- L'agent **génère et intègre** les fichiers, mais **ne voit pas** les images : c'est **toi qui
  juges/cures** la qualité et choisis les prompts.
- Modèle image dispo : `z_image_turbo` (rapide). Modèles vidéo (wan2.2) non utilisés ici.
- ComfyUI répond sur le **port 8000** (pas 8188) — déjà le défaut de `comfy-gen.ps1`.
