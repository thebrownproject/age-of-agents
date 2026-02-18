"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LobbyConfig } from "@/components/Lobby";
import { GameState, newGame } from "@/lib/engine/state";
import { runTurn, Agent } from "@/lib/engine/resolver";
import { AnthropicAgent } from "@/lib/agents/anthropic";
import { OpenAIAgent } from "@/lib/agents/openai";
import { PlayerPanel } from "@/components/PlayerPanel";
import { TileMap } from "@/components/TileMap";
import { EventLog } from "@/components/EventLog";

interface GameBoardProps {
  config: LobbyConfig;
  onReset: () => void;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

function makeAgent(modelId: string, persona: string, apiKey: string): Agent {
  if (modelId.startsWith("claude")) return new AnthropicAgent(modelId, persona, apiKey);
  if (modelId.startsWith("glm-")) {
    // Route through server-side Edge Function so ZAI_API_KEY never reaches the client bundle.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return new OpenAIAgent(modelId, persona, "proxy", `${origin}/api/glm`);
  }
  return new OpenAIAgent(modelId, persona, apiKey);
}

const WINNER_LABELS: Record<string, string> = {
  A: "Agent A Victorious!",
  B: "Agent B Victorious!",
  draw: "A Draw — Mutual Destruction!",
};

export function GameBoard({ config, onReset }: GameBoardProps) {
  const [gs, setGs] = useState<GameState>(newGame);
  const [phase, setPhase] = useState<"running" | "paused" | "finished">("running");
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"agents" | "battle" | "log">("battle");

  const TABS = [
    { id: "agents" as const, icon: "⚜", label: "Agents" },
    { id: "battle" as const, icon: "⚔", label: "Battlefield" },
    { id: "log"    as const, icon: "📜", label: "Chronicle" },
  ];

  const agentA = useRef<Agent>(makeAgent(config.p1Model, config.p1Persona, config.p1ApiKey));
  const agentB = useRef<Agent>(makeAgent(config.p2Model, config.p2Persona, config.p2ApiKey));
  // Each runGame invocation claims a unique ID. Any loop whose ID no longer
  // matches loopIdRef.current is stale and must exit immediately. This prevents
  // duplicate loops from React Strict Mode double-mount or pause/resume races.
  const loopIdRef = useRef(0);
  const gsRef = useRef<GameState>(newGame());

  const runGame = useCallback(async () => {
    const myId = ++loopIdRef.current;
    let state = gsRef.current;
    try {
      while (
        myId === loopIdRef.current &&
        (config.maxTurns === 0 || state.turn <= config.maxTurns) &&
        !state.winner
      ) {
        state = await runTurn(state, agentA.current, agentB.current);
        if (myId !== loopIdRef.current) return;  // Cancelled while awaiting API
        gsRef.current = state;
        setGs(structuredClone(state));
        await new Promise<void>((r) => setTimeout(r, 300));
      }
    } catch (err) {
      if (myId !== loopIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
    if (myId === loopIdRef.current) {
      setPhase("finished");
    }
  }, [config.maxTurns]);

  useEffect(() => {
    setPhase("running");
    runGame();
    return () => { loopIdRef.current++; };  // Invalidate loop on cleanup/re-mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePauseResume = () => {
    if (phase === "running") {
      loopIdRef.current++;  // Invalidate current loop — it will exit after its next await
      setPhase("paused");
    } else if (phase === "paused") {
      setPhase("running");
      runGame();
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        padding: "0.6rem",
        background: "radial-gradient(ellipse at top, #1a1208 0%, #0d0a06 100%)",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}
    >
      {/* ── Header (fixed) ───────────────────────────── */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "1rem", color: "var(--aoe-gold)", margin: 0, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Age of Agents
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="turn-badge">
            Turn {gs.turn}{config.maxTurns > 0 ? ` / ${config.maxTurns}` : ""}
          </span>
          {phase !== "finished" && (
            <button className="aoe-btn" onClick={handlePauseResume}>
              {phase === "running" ? "Pause" : "Resume"}
            </button>
          )}
          <button className="aoe-btn aoe-btn-danger" onClick={onReset}>New Game</button>
        </div>
      </div>

      {/* ── Error (fixed) ────────────────────────────── */}
      {error && (
        <div style={{ flexShrink: 0, background: "rgba(139,26,26,0.3)", border: "1px solid #8b1a1a", padding: "0.3rem 0.75rem", borderRadius: "2px", fontSize: "0.7rem", color: "#ff8080" }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Winner banner (fixed) ────────────────────── */}
      {gs.winner && (
        <div className="winner-banner" style={{ flexShrink: 0, padding: "0.6rem 1.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{WINNER_LABELS[gs.winner] ?? "Game Over"}</h2>
          <p style={{ margin: "0.2rem 0 0", opacity: 0.7, fontSize: "0.7rem" }}>
            {gs.winner === "A" ? `${config.p1Model} defeated ${config.p2Model}`
              : gs.winner === "B" ? `${config.p2Model} defeated ${config.p1Model}`
              : "Both Town Centers fell simultaneously"}
          </p>
        </div>
      )}

      {/* ── Main content — desktop 3-column ─────────── */}
      {!isMobile && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            gap: "0.4rem",
            overflow: "hidden",
          }}
        >
          {/* Player panels — left side, A on top / B on bottom */}
          <div
            style={{
              width: "240px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              minHeight: 0,
            }}
          >
            <PlayerPanel player={gs.players.A} model={config.p1Model} persona={config.p1Persona} />
            <PlayerPanel player={gs.players.B} model={config.p2Model} persona={config.p2Persona} />
          </div>
          <TileMap gs={gs} />
          <div style={{ width: "240px", flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <EventLog entries={gs.log} />
          </div>
        </div>
      )}

      {/* ── Main content — mobile tab layout ─────────── */}
      {isMobile && (
        <>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {activeTab === "agents" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0.2rem 0" }}>
                <PlayerPanel player={gs.players.A} model={config.p1Model} persona={config.p1Persona} />
                <PlayerPanel player={gs.players.B} model={config.p2Model} persona={config.p2Persona} />
              </div>
            )}
            {activeTab === "battle" && <TileMap gs={gs} />}
            {activeTab === "log"    && <EventLog entries={gs.log} />}
          </div>
          <nav className="mobile-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`mobile-tab${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="mobile-tab-icon">{tab.icon}</span>
                <span className="mobile-tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {/* ── Status footer (fixed) ────────────────────── */}
      <div style={{ flexShrink: 0, textAlign: "center", fontSize: "0.55rem", opacity: 0.3, fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
        {phase === "running" && "⚔ Battle in progress — agents deliberating..."}
        {phase === "paused" && "⏸ Paused"}
        {phase === "finished" && !gs.winner && "⏹ Game ended"}
        {phase === "finished" && gs.winner && "✦ Game complete"}
      </div>
    </div>
  );
}
