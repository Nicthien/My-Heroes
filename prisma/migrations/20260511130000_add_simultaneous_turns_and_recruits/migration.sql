ALTER TABLE "towns" ADD COLUMN "availableRecruits" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "towns" ADD COLUMN "lastBuiltTurn" INTEGER;

CREATE UNIQUE INDEX "turns_gameId_gamePlayerId_turnNumber_key" ON "turns"("gameId", "gamePlayerId", "turnNumber");
