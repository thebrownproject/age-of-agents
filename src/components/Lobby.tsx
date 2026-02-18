"use client";

import { useState } from "react";

export interface LobbyConfig {
  p1Model: string;
  p2Model: string;
  p1ApiKey: string;
  p2ApiKey: string;
  p1Persona: string;
  p2Persona: string;
  maxTurns: number;
}

interface LobbyProps {
  onStart: (config: LobbyConfig) => void;
}

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6",         label: "Claude Opus 4.6 (strongest)" },
  { id: "claude-sonnet-4-6",       label: "Claude Sonnet 4.6 (fast)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest)" },
];

const OPENAI_MODELS = [
  { id: "gpt-5",        label: "GPT-5 (strongest)" },
  { id: "gpt-5-mini",   label: "GPT-5 Mini (fast)" },
  { id: "gpt-5-nano",   label: "GPT-5 Nano (fastest)" },
  { id: "gpt-4.1",      label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (fast)" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano (fastest)" },
];

const GLM_MODELS = [
  { id: "glm-4.7",       label: "GLM-4.7 (z.ai)" },
  { id: "glm-4.5",       label: "GLM-4.5 (z.ai)" },
  { id: "glm-4.5-flash", label: "GLM-4.5 Flash (z.ai — fast)" },
];

const ALL_MODELS = [...GLM_MODELS, ...ANTHROPIC_MODELS, ...OPENAI_MODELS];

const PERSONAS = [
  "balanced",
  "aggressive rush — attack early and often",
  "economic — build economy first, then overwhelm",
  "defensive — turtle and research upgrades",
  "tech — rush to Imperial Age and use Catapults",
  "custom",
];

/** GLM models use the z.ai key from env — no user input needed. */
function needsApiKey(modelId: string): boolean {
  return !modelId.startsWith("glm-");
}

export function Lobby({ onStart }: LobbyProps) {
  const [p1Model, setP1Model] = useState("glm-4.7");
  const [p2Model, setP2Model] = useState("glm-4.7");
  const [p1ApiKey, setP1ApiKey] = useState("");
  const [p2ApiKey, setP2ApiKey] = useState("");
  const [sharedKey, setSharedKey] = useState("");
  const [useSharedKey, setUseSharedKey] = useState(true);
  const [p1Persona, setP1Persona] = useState("balanced");
  const [p2Persona, setP2Persona] = useState("aggressive rush — attack early and often");
  const [p1CustomPersona, setP1CustomPersona] = useState("");
  const [p2CustomPersona, setP2CustomPersona] = useState("");
  const [maxTurns, setMaxTurns] = useState(0);

  const p1NeedsKey = needsApiKey(p1Model);
  const p2NeedsKey = needsApiKey(p2Model);
  const anyNeedsKey = p1NeedsKey || p2NeedsKey;

  // GLM models use the server-side proxy — no client key needed.
  const resolveKey = (specificKey: string, modelId: string): string => {
    if (!needsApiKey(modelId)) return "";
    if (useSharedKey) return sharedKey;
    return specificKey;
  };

  const resolvePersona = (persona: string, custom: string) =>
    persona === "custom" ? custom : persona;

  const canStart = (): boolean => {
    if (!anyNeedsKey) return true;
    if (useSharedKey) return sharedKey.length > 8;
    if (p1NeedsKey && p1ApiKey.length <= 8) return false;
    if (p2NeedsKey && p2ApiKey.length <= 8) return false;
    return true;
  };

  const handleStart = () => {
    onStart({
      p1Model,
      p2Model,
      p1ApiKey: resolveKey(p1ApiKey, p1Model),
      p2ApiKey: resolveKey(p2ApiKey, p2Model),
      p1Persona: resolvePersona(p1Persona, p1CustomPersona),
      p2Persona: resolvePersona(p2Persona, p2CustomPersona),
      maxTurns,
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "radial-gradient(ellipse at center, #1a1208 0%, #0d0a06 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "700px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: "2.5rem",
              fontWeight: 900,
              color: "var(--aoe-gold)",
              textShadow: "2px 2px 6px #000, 0 0 20px rgba(240,192,64,0.4)",
              margin: 0,
              letterSpacing: "0.08em",
            }}
          >
            AGE OF AGENTS
          </h1>
          <div
            style={{
              fontFamily: "IM Fell English, serif",
              color: "var(--aoe-parchment)",
              marginTop: "0.5rem",
              opacity: 0.7,
              fontStyle: "italic",
            }}
          >
            Two AI generals. One battlefield. No mercy.
          </div>
        </div>

        <div className="aoe-panel">
          <div className="aoe-panel-title">Game Configuration</div>
          <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Models */}
            <div className="lobby-grid">
              <div>
                <label className="aoe-label">Agent A — Model</label>
                <select className="aoe-select" value={p1Model} onChange={(e) => setP1Model(e.target.value)}>
                  {ALL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="aoe-label">Agent B — Model</label>
                <select className="aoe-select" value={p2Model} onChange={(e) => setP2Model(e.target.value)}>
                  {ALL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Personas */}
            <div className="lobby-grid">
              <div>
                <label className="aoe-label">Agent A — Strategy</label>
                <select className="aoe-select" value={p1Persona} onChange={(e) => setP1Persona(e.target.value)}>
                  {PERSONAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {p1Persona === "custom" && (
                  <input
                    className="aoe-input"
                    style={{ marginTop: "0.4rem" }}
                    placeholder="Describe P1 strategy..."
                    value={p1CustomPersona}
                    onChange={(e) => setP1CustomPersona(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="aoe-label">Agent B — Strategy</label>
                <select className="aoe-select" value={p2Persona} onChange={(e) => setP2Persona(e.target.value)}>
                  {PERSONAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {p2Persona === "custom" && (
                  <input
                    className="aoe-input"
                    style={{ marginTop: "0.4rem" }}
                    placeholder="Describe P2 strategy..."
                    value={p2CustomPersona}
                    onChange={(e) => setP2CustomPersona(e.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Turn limit */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <label className="aoe-label" style={{ margin: 0, whiteSpace: "nowrap" }}>
                Turn Limit
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--aoe-gold)" }}
              />
              <span
                style={{
                  fontFamily: "Cinzel, serif",
                  color: "var(--aoe-gold)",
                  fontSize: "0.85rem",
                  minWidth: "5rem",
                  textAlign: "right",
                }}
              >
                {maxTurns === 0 ? "∞ Unlimited" : maxTurns}
              </span>
            </div>
            {maxTurns === 0 && (
              <div style={{ fontSize: "0.65rem", opacity: 0.5, fontStyle: "italic", marginTop: "-0.5rem" }}>
                Unlimited — game ends only when a Town Center falls or you stop it
              </div>
            )}

            {/* API Key section — only shown when a non-GLM model is selected */}
            {anyNeedsKey && (
              <>
                <hr className="aoe-divider" />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <label className="aoe-label" style={{ margin: 0 }}>API Keys</label>
                    {p1NeedsKey && p2NeedsKey && (
                      <button
                        onClick={() => setUseSharedKey(!useSharedKey)}
                        style={{
                          fontSize: "0.65rem",
                          fontFamily: "Cinzel, serif",
                          background: "rgba(90,62,27,0.3)",
                          border: "1px solid var(--aoe-border)",
                          color: "var(--aoe-parchment)",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "2px",
                          cursor: "pointer",
                        }}
                      >
                        {useSharedKey ? "Use separate keys" : "Use shared key"}
                      </button>
                    )}
                  </div>

                  {useSharedKey || !(p1NeedsKey && p2NeedsKey) ? (
                    <div>
                      <label className="aoe-label">
                        {p1NeedsKey && p2NeedsKey
                          ? "Shared API Key (Anthropic or OpenAI)"
                          : p1NeedsKey
                          ? "Agent A API Key (Anthropic or OpenAI)"
                          : "Agent B API Key (Anthropic or OpenAI)"}
                      </label>
                      <input
                        type="password"
                        className="aoe-input"
                        placeholder="sk-ant-... or sk-..."
                        value={sharedKey}
                        onChange={(e) => setSharedKey(e.target.value)}
                      />
                      <div style={{ fontSize: "0.65rem", opacity: 0.5, marginTop: "0.3rem", fontStyle: "italic" }}>
                        Key stays in your browser — never sent to our servers
                      </div>
                    </div>
                  ) : (
                    <div className="lobby-grid">
                      <div>
                        <label className="aoe-label">Agent A Key</label>
                        <input
                          type="password"
                          className="aoe-input"
                          placeholder="sk-ant-..."
                          value={p1ApiKey}
                          onChange={(e) => setP1ApiKey(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="aoe-label">Agent B Key</label>
                        <input
                          type="password"
                          className="aoe-input"
                          placeholder="sk-ant-..."
                          value={p2ApiKey}
                          onChange={(e) => setP2ApiKey(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Start button */}
            <button
              className="aoe-btn"
              onClick={handleStart}
              disabled={!canStart()}
              style={{ width: "100%", padding: "0.75rem", fontSize: "1rem" }}
            >
              Begin the Battle
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.65rem", opacity: 0.4 }}>
          API calls go directly from your browser to Anthropic / OpenAI / z.ai. No data is stored.
        </div>
      </div>
    </div>
  );
}
