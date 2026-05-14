<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Security

- Never commit secrets (passwords, tokens, API keys) to the repository.
- `.env*` files are ignored by git, except `.env.example` which serves as a template.
- Always verify that no sensitive data is present in the code before pushing.
- Supabase service role keys and database credentials must remain in `.env` (not versioned).

# Map Generation Design

- Keep resource-producing map buildings separate from adventure buildings.
- Resource buildings use `MapObject.type === "building"` and are economic objectives: mines, sawmills, pits, labs, etc. They should be eligible for road connection so players can read the economy routes clearly.
- Adventure buildings use `MapObject.type === "adventure_building"` and reward exploration: observatories, campfires, lighthouses, Stargates, and future adventure objects. They should not be connected by generated roads.
- When placing adventure buildings, prefer tiles away from roads and never place them directly on a road tile. Small dense maps may use a fallback near roads only when needed to keep adventure density.
- Do not add adventure building positions to mining/resource road targets such as `miningPositions` or `buildSecondaryRoads`.
- Keep blocking decor visually distinct from scenic decor. A single decor kind should not sometimes block and sometimes be passable; use obstacle-specific kinds such as groves or boulder clusters for impassable decoration, and keep ordinary trees, bushes, flowers, and small rocks passable.
