"use client";

import { PlayerState } from "@/lib/engine/state";
import { TOWN_CENTER_HP, AGE_NAMES, AGE_ADVANCE_COSTS } from "@/lib/config";

interface PlayerPanelProps {
  player: PlayerState;
  model: string;
  persona: string;
}

function shortModel(modelId: string): string {
  if (modelId === "claude-sonnet-4-6") return "Sonnet 4.6";
  if (modelId === "claude-haiku-4-5-20251001") return "Haiku 4.5";
  if (modelId === "claude-opus-4-6") return "Opus 4.6";
  if (modelId === "gpt-5") return "GPT-5";
  if (modelId === "gpt-5-mini") return "GPT-5 Mini";
  if (modelId === "gpt-5-nano") return "GPT-5 Nano";
  if (modelId === "gpt-4.1") return "GPT-4.1";
  if (modelId === "gpt-4.1-mini") return "GPT-4.1 Mini";
  if (modelId === "gpt-4.1-nano") return "GPT-4.1 Nano";
  if (modelId === "glm-4.5-flash") return "GLM-4.5 Flash";
  if (modelId === "glm-4.5") return "GLM-4.5";
  if (modelId === "glm-4.7") return "GLM-4.7";
  return modelId;
}

const RESOURCE_ICONS: Record<string, string> = { food: "🥩", wood: "🪵", gold: "💰" };

export function PlayerPanel({ player, model, persona }: PlayerPanelProps) {
  const tcPct = Math.max(0, (player.townCenterHp / TOWN_CENTER_HP) * 100);
  const tcColor = tcPct > 60 ? "#2a8a2a" : tcPct > 30 ? "#8a7a2a" : "#8a2a2a";

  const allUnits: Record<string, number> = {};
  for (const zoneUnits of Object.values(player.units)) {
    for (const [unit, cnt] of Object.entries(zoneUnits)) {
      if (cnt > 0) allUnits[unit] = (allUnits[unit] ?? 0) + cnt;
    }
  }

  const allBuildings: Record<string, number> = {};
  for (const blist of Object.values(player.buildings)) {
    for (const b of blist) allBuildings[b] = (allBuildings[b] ?? 0) + 1;
  }

  const accentColor = player.playerId === "A" ? "#1a4a8a" : "#7a2a2a";
  const nameColor   = player.playerId === "A" ? "#4a8adf" : "#aa4a4a";
  const label       = player.playerId === "A" ? "Agent A" : "Agent B";

  // Age advancement progress — fraction of next-age cost currently on hand
  const nextAgeCost = player.age < 4 ? (AGE_ADVANCE_COSTS[player.age + 1] ?? {}) : {};
  const totalNeeded = Object.values(nextAgeCost).reduce<number>((s, v) => s + (v ?? 0), 0);
  const totalHave   = Object.entries(nextAgeCost).reduce<number>(
    (s, [r, v]) => s + Math.min((player.resources as Record<string, number>)[r] ?? 0, v ?? 0), 0,
  );
  const ageProgress = totalNeeded > 0 ? totalHave / totalNeeded : 1;

  return (
    <div
      className="aoe-panel"
      style={{
        borderColor: accentColor,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Panel header ─────────────────────────── */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${accentColor}` }}>
        <div
          className="aoe-panel-title"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderColor: accentColor, borderBottom: "none" }}
        >
          <span style={{ color: nameColor }}>{label}</span>
          <span className="age-badge">{AGE_NAMES[player.age]} Age</span>
        </div>
        <div style={{ fontSize: "0.58rem", opacity: 0.55, fontStyle: "italic",
                      padding: "0.1rem 0.6rem 0.25rem", color: "var(--aoe-parchment)" }}>
          {shortModel(model)}  ·  {persona}
        </div>
      </div>

      {/* ── Stats block (fixed height, no scroll) ─── */}
      <div style={{ flexShrink: 0, padding: "0.5rem 0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>

        {/* TC HP bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
            <span style={{ fontSize: "0.6rem", fontFamily: "Cinzel, serif", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Town Center</span>
            <span style={{ fontSize: "0.6rem", fontFamily: "Cinzel, serif", color: "var(--aoe-gold)" }}>{player.townCenterHp}/{TOWN_CENTER_HP}</span>
          </div>
          <div className="hp-bar-bg">
            <div className="hp-bar-fill" style={{ width: `${tcPct}%`, background: tcColor }} />
          </div>
        </div>

        {/* Age progress */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
            <span style={{ fontSize: "0.55rem", fontFamily: "Cinzel, serif", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {player.age < 4 ? `→ ${AGE_NAMES[player.age + 1]} Age` : "✦ Imperial"}
            </span>
            <span style={{ fontSize: "0.55rem", fontFamily: "Cinzel, serif", color: "var(--aoe-gold)" }}>
              {player.age < 4 ? `${Math.round(ageProgress * 100)}%` : "Max"}
            </span>
          </div>
          <div className="hp-bar-bg">
            <div
              className="hp-bar-fill"
              style={{
                width: `${ageProgress * 100}%`,
                background: ageProgress >= 1 ? "#f0c040" : "#c89020",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* Combat stats */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {([
            { label: "ATK", value: `+${player.attackBonus}`, tip: "Attack bonus — added to every unit's attack damage" },
            { label: "ARM", value: `+${player.armorBonus}`,  tip: "Armor bonus — added to every unit's HP" },
            { label: "KO",  value: String(player.unitsKilled), tip: "Total enemy units killed this game" },
          ] as const).map(({ label, value, tip }) => (
            <span key={label} title={tip} style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
              <span style={{ fontFamily: "Cinzel, serif", fontSize: "0.5rem", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
              <span style={{ fontFamily: "Cinzel, serif", fontSize: "0.8rem", color: "var(--aoe-gold)" }}>{value}</span>
            </span>
          ))}
        </div>

        {/* Resources */}
        <div className="resource-row">
          {(["food", "wood", "gold"] as const).map((res) => (
            <span key={res} style={{ display: "flex", alignItems: "center", gap: "0.2rem", flex: 1 }}>
              <span style={{ fontSize: "0.75rem" }}>{RESOURCE_ICONS[res]}</span>
              <span className="resource-val">{player.resources[res]}</span>
            </span>
          ))}
        </div>

        {/* Villager Tasks */}
        {Object.keys(player.villagerTasks).length > 0 && (
          <div>
            <div style={{ fontSize: "0.55rem", fontFamily: "Cinzel, serif", opacity: 0.55, marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Villager Tasks</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
              {Object.entries(player.villagerTasks)
                .filter(([, v]) => (v ?? 0) > 0)
                .map(([res, n]) => (
                  <span key={res} style={{
                    display: "flex", alignItems: "center", gap: "0.25rem",
                    fontSize: "0.6rem", fontFamily: "Cinzel, serif",
                    background: "rgba(0,0,0,0.35)", border: "1px solid var(--aoe-border)",
                    padding: "0.1rem 0.4rem", borderRadius: "2px",
                  }}>
                    <span style={{ fontSize: "0.7rem" }}>{RESOURCE_ICONS[res] ?? res}</span>
                    <span style={{ color: "var(--aoe-gold)" }}>{n}</span>
                    <span style={{ opacity: 0.45, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>vil</span>
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Units */}
        {Object.keys(allUnits).length > 0 && (
          <div>
            <div style={{ fontSize: "0.55rem", fontFamily: "Cinzel, serif", opacity: 0.55, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Units</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
              {Object.entries(allUnits).map(([unit, count]) => (
                <span key={unit} style={{ fontSize: "0.6rem", background: "rgba(0,0,0,0.4)", border: "1px solid var(--aoe-border)", padding: "0.1rem 0.3rem", borderRadius: "2px", fontFamily: "Cinzel, serif" }}>
                  {count}× {unit}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Buildings */}
        {Object.keys(allBuildings).length > 0 && (
          <div>
            <div style={{ fontSize: "0.55rem", fontFamily: "Cinzel, serif", opacity: 0.55, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Buildings</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
              {Object.entries(allBuildings).map(([building, count]) => (
                <span key={building} style={{ fontSize: "0.6rem", background: "rgba(90,62,27,0.3)", border: "1px solid var(--aoe-border)", padding: "0.1rem 0.3rem", borderRadius: "2px", fontFamily: "Cinzel, serif" }}>
                  {count > 1 ? `${count}× ` : ""}{building}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Upgrades */}
        {player.upgrades.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
            {player.upgrades.map((upg) => (
              <span key={upg} style={{ fontSize: "0.6rem", background: "rgba(240,192,64,0.1)", border: "1px solid var(--aoe-border-hi)", padding: "0.1rem 0.3rem", borderRadius: "2px", fontFamily: "Cinzel, serif", color: "var(--aoe-gold)" }}>
                {upg}
              </span>
            ))}
          </div>
        )}

      </div>

      {/* ── Training queue — scrollable, pinned to bottom ─── */}
      {player.productionQueue.length > 0 && (
        <div style={{
          flexShrink: 0,
          maxHeight: "6rem",
          overflowY: "auto",
          borderTop: `1px solid ${accentColor}`,
          padding: "0.3rem 0.6rem",
        }}>
          <div style={{ fontSize: "0.55rem", fontFamily: "Cinzel, serif", opacity: 0.55, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Training</div>
          {player.productionQueue.map((item, i) => (
            <div key={i} className="queue-item">
              <span>⚒ {item.unitType}</span>
              <span className="queue-turns">{item.turnsLeft}t</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
