"use client";

import {
  AI_PERSONALITIES,
  AI_PERSONALITY_PROFILES,
  rollAiPersonality,
  type AiPersonality,
} from "@/lib/game/ai/strategy/personality";
import { useState } from "react";

const DIFFICULTIES: Array<"simple" | "normal" | "hard"> = ["simple", "normal", "hard"];

export default function AiDevPage() {
  const [seed, setSeed] = useState("game-1");
  const [difficulty, setDifficulty] = useState<"simple" | "normal" | "hard">("normal");

  const samples = Array.from({ length: 8 }, (_, i) => ({
    playerId: `player-${i + 1}`,
    personality: rollAiPersonality(`${seed}:player-${i + 1}`, difficulty),
  }));

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>IA — Aperçu stratégique</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Simulation de tirage de personnalités</h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <label>
            Seed :{" "}
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              style={{ padding: 4, border: "1px solid #ccc" }}
            />
          </label>
          <label>
            Difficulté :{" "}
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as "simple" | "normal" | "hard")}
              style={{ padding: 4 }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 600 }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={cellStyle}>Joueur</th>
              <th style={cellStyle}>Personnalité tirée</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.playerId}>
                <td style={cellStyle}>{s.playerId}</td>
                <td style={cellStyle}>{s.personality}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Profils de personnalité</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {AI_PERSONALITIES.map((p: AiPersonality) => {
            const profile = AI_PERSONALITY_PROFILES[p];
            return (
              <div key={p} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fafafa" }}>
                <h3 style={{ fontSize: 16, marginBottom: 8 }}>{p}</h3>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                  Build : {profile.buildPriority.slice(0, 4).join(" → ")}
                </p>
                <ul style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                  {Object.entries(profile.profileOverrides).map(([key, value]) => (
                    <li key={key}>{key} : <b>{value}</b></li>
                  ))}
                </ul>
                <div style={{ fontSize: 12, color: "#666" }}>
                  <div>Recrute héros : ×{profile.recruitHeroBias}</div>
                  <div>Fusionne armée : ×{profile.mergeArmyBias}</div>
                  <div>Ennemi principal : ×{profile.primaryEnemyAggressionBonus}</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <strong>Skills :</strong>
                  <div>Combat ×{profile.skillPreference.combat} · Eco ×{profile.skillPreference.economy} · Magie ×{profile.skillPreference.magic} · Util ×{profile.skillPreference.utility}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const cellStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid #ddd",
  textAlign: "left",
  fontSize: 14,
};
