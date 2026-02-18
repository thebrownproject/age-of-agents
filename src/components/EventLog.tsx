"use client";

import { useState } from "react";

interface EventLogProps {
  entries: string[];
}

type EntryType = "combat" | "victory" | "error" | "advance" | "event";

interface FormattedEntry {
  key: number;
  turn: string;
  turnNum: number;
  text: string;
  type: EntryType;
  player: "A" | "B" | null;
}

const PLAYER_COLOR: Record<"A" | "B", string> = {
  A: "#4a8adf",
  B: "#aa4a4a",
};

const TYPE_COLOR: Record<EntryType, string> = {
  combat:  "#cc5555",
  victory: "var(--aoe-gold)",
  error:   "#c89030",
  advance: "#7aaa4a",
  event:   "var(--aoe-parchment)",
};

const ZONE_LABELS: Record<string, string> = {
  Base_A: "Village A",
  Top_A:  "Left Flank A",
  Mid_A:  "Battlefield A",
  Bot_A:  "Right Flank A",
  Top_B:  "Left Flank B",
  Mid_B:  "Battlefield B",
  Bot_B:  "Right Flank B",
  Base_B: "Village B",
};
function fz(z: string) { return ZONE_LABELS[z] ?? z.replace(/_/g, " "); }

function formatEntry(raw: string, key: number): FormattedEntry | null {
  const m = raw.match(/^\[T(\d+)\]\s*/);
  const turn = m ? `T${m[1]}` : "";
  const turnNum = m ? parseInt(m[1]) : 0;
  const body = (m ? raw.slice(m[0].length) : raw).trimStart();

  if (/^P[AB] income:/.test(body)) return null;
  if (/^[AB] actions:/.test(body)) return null;
  if (/^P[AB] tasked villagers:/.test(body)) return null;
  const queueM = body.match(/^P([AB]) queued (\d+)×(\w+)/);
  if (queueM)
    return { key, turn, turnNum, text: `${queueM[1]} training ${queueM[2]}× ${queueM[3]}`, type: "event", player: queueM[1] as "A" | "B" };

  if (/Player [AB] wins|Draw —|Turn limit/.test(body))
    return { key, turn, turnNum, text: body, type: "victory", player: null };

  const advM = body.match(/^P([AB]) advanced to Age \d+ \((.+?)\)/);
  if (advM)
    return { key, turn, turnNum, text: `★ Agent ${advM[1]} advances to ${advM[2]} Age`, type: "advance", player: advM[1] as "A" | "B" };

  const moveM = body.match(/^P([AB]) moved (\d+)×(\w+): (\w+)→(\w+)/);
  if (moveM) {
    const [, pid, cnt, unit, from, to] = moveM;
    return { key, turn, turnNum, text: `${pid} moved ${cnt} ${unit}: ${fz(from)} → ${fz(to)}`, type: "event", player: pid as "A" | "B" };
  }

  const builtM = body.match(/^P([AB]) built (.+?) in (.+)/);
  if (builtM)
    return { key, turn, turnNum, text: `${builtM[1]} built ${builtM[2]} in ${fz(builtM[3])}`, type: "event", player: builtM[1] as "A" | "B" };

  // "PA trained Villager → Base_A" — capture zone too
  const trainM = body.match(/^P([AB]) trained (\w+) → (\w+)/);
  if (trainM)
    return { key, turn, turnNum, text: `${trainM[1]} spawned ${trainM[2]} at ${fz(trainM[3])}`, type: "event", player: trainM[1] as "A" | "B" };

  // "PA researched attack_1 (+2 atk...)" — pretty-print upgrade name
  const UPGRADE_NAMES: Record<string, string> = {
    attack_1: "Attack Upgrade I", armor_1: "Armour Upgrade I",
    attack_2: "Attack Upgrade II", armor_2: "Armour Upgrade II",
  };
  const resM = body.match(/^P([AB]) researched (.+?) \(/);
  if (resM)
    return { key, turn, turnNum, text: `${resM[1]} researched ${UPGRADE_NAMES[resM[2]] ?? resM[2]}`, type: "advance", player: resM[1] as "A" | "B" };

  const combatM = body.match(/^Combat in (.+?):/);
  if (combatM)
    return { key, turn, turnNum, text: `⚔ Combat in ${fz(combatM[1])}`, type: "combat", player: null };

  // "PA lost 2×Militia in Top_A" — capture zone
  const lostM = body.match(/P([AB]) lost (\d+)×(\w+) in (\w+)/);
  if (lostM)
    return { key, turn, turnNum, text: `${lostM[1]} lost ${lostM[2]} ${lostM[3]} in ${fz(lostM[4])}`, type: "combat", player: lostM[1] as "A" | "B" };

  const tcM = body.match(/([AB])'s forces \((.+?)\) hit P([AB])'s Town Center for (\d+) dmg \(TC HP: (\d+)\)/);
  if (tcM)
    return { key, turn, turnNum, text: `⚔ ${tcM[1]}'s forces struck ${tcM[3]}'s Town Center — ${tcM[4]} dmg (HP: ${tcM[5]})`, type: "combat", player: tcM[1] as "A" | "B" };

  const towerM = body.match(/([AB])'s (\d+) Tower\(s\) in (.+?) fire (\d+) dmg/);
  if (towerM)
    return { key, turn, turnNum, text: `⚔ ${towerM[1]}'s Tower${towerM[2] !== "1" ? "s" : ""} in ${fz(towerM[3])} fired ${towerM[4]} dmg`, type: "combat", player: towerM[1] as "A" | "B" };

  // "A's forces destroyed PB's Wall in Top_A!" — proper zone name
  const wallDestroyM = body.match(/([AB])'s forces destroyed P([AB])'s Wall in (\w+)/);
  if (wallDestroyM)
    return { key, turn, turnNum, text: `${wallDestroyM[1]} destroyed ${wallDestroyM[2]}'s Wall in ${fz(wallDestroyM[3])}`, type: "combat", player: wallDestroyM[1] as "A" | "B" };

  // "PB's Wall absorbed damage (HP: 50)"
  const wallAbsorbM = body.match(/P([AB])'s Wall absorbed damage \(HP: (\d+)\)/);
  if (wallAbsorbM)
    return { key, turn, turnNum, text: `${wallAbsorbM[1]}'s Wall held — HP: ${wallAbsorbM[2]}`, type: "combat", player: wallAbsorbM[1] as "A" | "B" };

  // "⚠ PA error: <message>" — handle both numeric codes and plain strings
  const errM = body.match(/^⚠ P([AB]) error: (.+)/);
  if (errM) {
    const raw = errM[2].trim();
    const label = raw === "429" ? "rate limited"
      : /^\d+$/.test(raw) ? `API error ${raw}`
      : raw;
    return { key, turn, turnNum, text: `⚠ Agent ${errM[1]}: ${label}`, type: "error", player: errM[1] as "A" | "B" };
  }

  return { key, turn, turnNum, text: body, type: "event", player: null };
}

interface TurnGroup {
  turnLabel: string;
  turnNum: number;
  entries: FormattedEntry[];
}

function groupByTurn(entries: FormattedEntry[]): TurnGroup[] {
  const map = new Map<string, TurnGroup>();
  for (const entry of entries) {
    const key = entry.turn || "T0";
    if (!map.has(key)) map.set(key, { turnLabel: entry.turn || "—", turnNum: entry.turnNum, entries: [] });
    map.get(key)!.entries.push(entry);
  }
  return Array.from(map.values()).sort((a, b) => b.turnNum - a.turnNum);
}

function EntryRow({ entry, large }: { entry: FormattedEntry; large?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.35rem",
        fontSize: large ? "0.72rem" : "0.62rem",
        lineHeight: 1.55,
        borderBottom: "1px solid rgba(90,62,27,0.12)",
        paddingBottom: "0.05rem",
        marginBottom: "0.05rem",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: entry.player ? PLAYER_COLOR[entry.player] : "transparent",
          flexShrink: 0,
          marginTop: large ? "0.45rem" : "0.4rem",
        }}
      />
      <span style={{ color: TYPE_COLOR[entry.type] }}>{entry.text}</span>
    </div>
  );
}

export function EventLog({ entries }: EventLogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const formatted = entries
    .map((raw, i) => formatEntry(raw, i))
    .filter((e): e is FormattedEntry => e !== null);

  const groups = groupByTurn(formatted);
  const latest = groups[0];
  const older  = groups.slice(1);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="aoe-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="aoe-panel-title">Battle Chronicle</div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0.5rem 0.75rem" }}>

        {formatted.length === 0 && (
          <div style={{ color: "rgba(200,169,110,0.4)", fontStyle: "italic" }}>
            Awaiting first orders...
          </div>
        )}

        {/* ── Latest turn — prominent ─────────────────── */}
        {latest && (
          <div style={{ marginBottom: "0.6rem" }}>
            <div style={{
              fontFamily: "Cinzel, serif",
              fontSize: "0.7rem",
              color: "var(--aoe-gold)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "0.3rem",
              paddingBottom: "0.2rem",
              borderBottom: "1px solid rgba(240,192,64,0.25)",
            }}>
              {latest.turnLabel}
            </div>
            {latest.entries.map((e) => <EntryRow key={e.key} entry={e} large />)}
          </div>
        )}

        {/* ── Older turns — accordions ────────────────── */}
        {older.map((group) => {
          const isOpen = expanded.has(group.turnLabel);
          return (
            <div key={group.turnLabel} style={{ marginBottom: "0.2rem" }}>
              <button
                onClick={() => toggle(group.turnLabel)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(90,62,27,0.3)",
                  borderRadius: "2px",
                  padding: "0.15rem 0.4rem",
                  cursor: "pointer",
                  color: "rgba(200,169,110,0.55)",
                  fontFamily: "Cinzel, serif",
                  fontSize: "0.58rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <span>{group.turnLabel}</span>
                <span style={{ fontSize: "0.5rem", opacity: 0.7 }}>
                  {group.entries.length} event{group.entries.length !== 1 ? "s" : ""}{"  "}{isOpen ? "▾" : "▸"}
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: "0.25rem 0.3rem 0.1rem", borderLeft: "1px solid rgba(90,62,27,0.3)" }}>
                  {group.entries.map((e) => <EntryRow key={e.key} entry={e} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
