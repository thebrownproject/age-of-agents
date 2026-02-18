"use client";

import { useEffect, useRef } from "react";

interface PlayerLogProps {
  playerId: "A" | "B";
  log: string[];
}

/** Keep only lines relevant to this player (income, train, build, move, combat, etc.) */
function filterLog(log: string[], pid: "A" | "B"): string[] {
  return log.filter((line) => {
    if (/\b[AB] actions:/.test(line)) return false; // skip raw JSON dumps
    if (line.includes(`P${pid} `) || line.includes(`  P${pid} `)) return true;
    if (line.includes(`Player ${pid}`) || line.includes("Draw") || line.includes("Turn limit")) return true;
    if (line.includes("Combat in") || line.includes("Tower(s)") || line.includes("Town Center")) return true;
    return false;
  });
}

export function PlayerLog({ playerId, log }: PlayerLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  const entries = filterLog(log, playerId);
  const accentColor = playerId === "A" ? "#4a7a2a" : "#7a2a2a";
  const nameColor   = playerId === "A" ? "#6aaa4a" : "#aa4a4a";
  const label       = playerId === "A" ? "Player A — Moves" : "Player B — Moves";

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
      <div
        className="aoe-panel-title"
        style={{ flexShrink: 0, borderColor: accentColor }}
      >
        <span style={{ color: nameColor }}>{label}</span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0.4rem 0.6rem",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--aoe-border) transparent",
        }}
      >
        {entries.length === 0 && (
          <div style={{ fontSize: "0.65rem", opacity: 0.3, fontStyle: "italic" }}>
            Awaiting first orders...
          </div>
        )}
        {entries.map((line, i) => {
          const isCombat = line.includes("Combat in") || line.includes("lost") || line.includes("Town Center") || line.includes("Tower");
          const isGlobal = line.includes("Player") || line.includes("Draw") || line.includes("Turn limit");
          const color = isGlobal ? "var(--aoe-gold)" : isCombat ? "#d08060" : "var(--aoe-parchment)";
          return (
            <div
              key={i}
              style={{
                fontSize: "0.65rem",
                lineHeight: 1.6,
                color,
                borderBottom: "1px solid rgba(90,62,27,0.12)",
                opacity: i === entries.length - 1 ? 1 : 0.82,
              }}
            >
              {line}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
