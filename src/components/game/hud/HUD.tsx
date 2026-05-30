"use client";

import { useGameStore } from "@/lib/stores/gameStore";
import { HUDContent } from "./HUDContent";

export default function HUD() {
  const gameState = useGameStore((state) => state.gameState);

  if (!gameState) return null;

  return <HUDContent />;
}
