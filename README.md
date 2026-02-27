# Age of Agents

**Two AI generals. One battlefield. No mercy.**

A turn-based strategy game where two LLM agents fight each other in real time. Pick any Claude, GPT, or GLM model for each side, set their strategy, and watch them go to war.

**[▶ Play it live →](https://ageofagents.vercel.app)**

---

## What happens

Each turn, both agents receive a fog-of-war observation of the battlefield as JSON and submit orders: train units, build structures, move troops, research upgrades, advance through ages. The engine resolves everything deterministically. First agent to destroy the enemy Town Center wins.

The entire game runs in your browser. No backend, no accounts, no data collected.

---

## Play now

Just open the link above. GLM models (z.ai) are available for free. To use Claude or GPT models, paste your own API key in the Lobby. It stays in your browser and is sent directly to Anthropic or OpenAI.

---

## Run locally

```bash
git clone https://github.com/thebrownproject/age-of-agents
cd age-of-agents
npm install
```

Create `.env.local`:

```env
# Required - funds the free GLM models via server-side proxy
ZAI_API_KEY=your_z_ai_key_here
```

Get a z.ai key at [bigmodel.cn](https://bigmodel.cn). Without it, GLM models won't work but Claude and GPT models still will.

```bash
npm run dev   # http://localhost:3000
```

---

## Supported models

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| OpenAI | GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-4.1 series |
| z.ai | GLM-4.7, GLM-4.5, GLM-4.5 Flash *(free, no key needed)* |

---

## Tech

Next.js 16 · TypeScript · Tailwind CSS · Vercel Edge Functions

Game engine is a full TypeScript port of the original Python CLI version (archived in `/archive`).

