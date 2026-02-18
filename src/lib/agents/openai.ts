/**
 * OpenAI agent — uses json_object response format to enforce JSON output.
 * Port of agents/openai_agent.py
 */

import OpenAI from "openai";
import { Agent } from "@/lib/agents/base";
import { buildSystemPrompt } from "@/lib/prompts/builder";

const ACTION_SCHEMA_DESCRIPTION = `
Respond with ONLY a JSON object (no markdown) with this exact schema:
{
  "train": [{"unit": "<UnitName>", "count": <int>}],
  "build": [{"building": "<BuildingName>", "zone": "<optional zone>"}],
  "move": [{"unit": "<UnitName>", "count": <int>, "from": "<Zone>", "to": "<Zone>"}],
  "attack": [],
  "advance_age": <bool>,
  "task_villagers": {"food": <int>, "wood": <int>, "gold": <int>},
  "research": [{"upgrade": "<UpgradeName>"}]
}
Valid units: Villager, Militia, Archer, Knight, Catapult
Valid buildings: Barracks, Range, Wall, Tower, Blacksmith
Valid zones: Base_A, Top_A, Mid_A, Bot_A, Top_B, Mid_B, Bot_B, Base_B
Valid upgrades: attack_1, armor_1, attack_2, armor_2
`;

export class OpenAIAgent implements Agent {
  private readonly client: OpenAI;
  private readonly modelId: string;
  private readonly persona: string;
  private history: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  constructor(modelId: string, persona: string, apiKey: string, baseURL?: string) {
    this.modelId = modelId;
    this.persona = persona;
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), dangerouslyAllowBrowser: true });
  }

  async getAction(observation: object): Promise<object> {
    const obsText = JSON.stringify(observation, null, 2);
    const system = buildSystemPrompt(this.persona) + "\n\n" + ACTION_SCHEMA_DESCRIPTION;
    const userMsg =
      `Current game state observation:\n\`\`\`json\n${obsText}\n\`\`\`\n\n` +
      "Output your action JSON now.";

    const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
    let lastError: unknown;
    let content = "{}";

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.modelId,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            ...this.history,
            { role: "user", content: userMsg },
          ],
        });
        content = response.choices[0]?.message?.content || "{}";
        break;
      } catch (err) {
        if (err instanceof OpenAI.RateLimitError && attempt < RETRY_DELAYS_MS.length) {
          const wait = RETRY_DELAYS_MS[attempt];
          console.warn(`[OpenAIAgent:${this.modelId}] rate limited — retrying in ${wait / 1000}s`);
          await new Promise((r) => setTimeout(r, wait));
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (content === "{}" && lastError) throw lastError;

    const action = JSON.parse(content) as object;


    // Only push to history if the model actually submitted a meaningful action
    const hasContent = Object.values(action as Record<string, unknown>).some(
      (v) => v !== false && (Array.isArray(v) ? v.length > 0 : !!v),
    );
    if (hasContent) {
      this.history.push({ role: "user", content: userMsg });
      this.history.push({ role: "assistant", content });
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }
    }

    return action;
  }
}
