"use client";

import { Leaderboard } from "@/app/dashboard/Leaderboard";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

const MOCK_ENTRIES: LeaderboardEntry[] = [
  { userId: "u1", name: "Leon Sticky-Fingers", gamesPlayed: 12, gamesWon: 8, bestScore: 18420, totalScore: 96510 },
  { userId: "u2", name: "Aldric le Brave", gamesPlayed: 9, gamesWon: 4, bestScore: 14300, totalScore: 61200 },
  { userId: "u3", name: "Morgane", gamesPlayed: 15, gamesWon: 3, bestScore: 9800, totalScore: 54000 },
  { userId: "u4", name: null, gamesPlayed: 2, gamesWon: 0, bestScore: 1200, totalScore: 1800 },
];

export default function DevLeaderboardPage() {
  return (
    <div className="min-h-screen bg-stone-950 p-6">
      <div className="mx-auto max-w-3xl">
        <Leaderboard entries={MOCK_ENTRIES} />
      </div>
    </div>
  );
}
