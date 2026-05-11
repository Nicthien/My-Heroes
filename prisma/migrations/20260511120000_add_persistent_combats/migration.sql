CREATE TABLE "neutral_armies" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "neutral_armies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "neutral_army_stacks" (
    "id" TEXT NOT NULL,
    "neutralArmyId" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "health" INTEGER NOT NULL,
    "maxHealth" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "neutral_army_stacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "combats" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "attackerPlayerId" TEXT NOT NULL,
    "defenderPlayerId" TEXT,
    "attackerHeroId" TEXT NOT NULL,
    "defenderHeroId" TEXT,
    "neutralArmyId" TEXT,
    "currentPlayerId" TEXT,
    "currentUnitId" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "boardState" JSONB NOT NULL,
    "turnQueue" JSONB NOT NULL DEFAULT '[]',
    "actionLog" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combats_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "neutral_armies" ADD CONSTRAINT "neutral_armies_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "neutral_army_stacks" ADD CONSTRAINT "neutral_army_stacks_neutralArmyId_fkey" FOREIGN KEY ("neutralArmyId") REFERENCES "neutral_armies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combats" ADD CONSTRAINT "combats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combats" ADD CONSTRAINT "combats_attackerHeroId_fkey" FOREIGN KEY ("attackerHeroId") REFERENCES "heroes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combats" ADD CONSTRAINT "combats_defenderHeroId_fkey" FOREIGN KEY ("defenderHeroId") REFERENCES "heroes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "combats" ADD CONSTRAINT "combats_neutralArmyId_fkey" FOREIGN KEY ("neutralArmyId") REFERENCES "neutral_armies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
