CREATE TABLE "combat_participants" (
    "id" TEXT NOT NULL,
    "combatId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "heroId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combat_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "combat_participants_combatId_heroId_key" ON "combat_participants"("combatId", "heroId");

ALTER TABLE "combat_participants" ADD CONSTRAINT "combat_participants_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "combats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combat_participants" ADD CONSTRAINT "combat_participants_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combat_participants" ADD CONSTRAINT "combat_participants_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
