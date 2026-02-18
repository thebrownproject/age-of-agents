/**
 * Anthropic Claude agent — uses tool_use to enforce JSON output.
 * Port of agents/anthropic_agent.py
 */

import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "@/lib/agents/base";
import { buildSystemPrompt } from "@/lib/prompts/builder";

const ACTION_TOOL: Anthropic.Tool = {
  name: "submit_action",
  description: "Submit your strategic action for this turn.",
  input_schema: {
    type: "object" as const,
    properties: {
      train: {
        type: "array",
        items: {
          type: "object",
          properties: {
            unit:  { type: "string" },
            count: { type: "integer" },
          },
          required: ["unit", "count"],
        },
      },
      build: {
        type: "array",
        items: {
          type: "object",
          properties: {
            building: { type: "string" },
            zone:     { type: "string" },
          },
          required: ["building"],
        },
      },
      move: {
        type: "array",
        items: {
          type: "object",
          properties: {
            unit:  { type: "string" },
            count: { type: "integer" },
            from:  { type: "string" },
            to:    { type: "string" },
          },
          required: ["unit", "count", "from", "to"],
        },
      },
      attack:      { type: "array", items: { type: "object" } },
      advance_age: { type: "boolean", description: "Set to true to advance to the next age." },
      task_villagers: {
        type: "object",
        description: "Assign villagers to tasks. Keys: food, wood, gold.",
        properties: {
          food: { type: "integer" },
          wood: { type: "integer" },
          gold: { type: "integer" },
        },
      },
      research: {
        type: "array",
        description: "Upgrades to research at the Blacksmith.",
        items: {
          type: "object",
          properties: {
            upgrade: {
              type: "string",
              enum: ["attack_1", "armor_1", "attack_2", "armor_2"],
            },
          },
          required: ["upgrade"],
        },
      },
    },
    required: ["train", "build", "move", "attack"],
  },
};

export class AnthropicAgent implements Agent {
  private readonly client: Anthropic;
  private readonly modelId: string;
  private readonly persona: string;
  private history: Anthropic.MessageParam[] = [];

  constructor(modelId: string, persona: string, apiKey: string) {
    this.modelId = modelId;
    this.persona = persona;
    // dangerouslyAllowBrowser lets the SDK run in a browser context
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async getAction(observation: object): Promise<object> {
    const obsText = JSON.stringify(observation, null, 2);
    const system = buildSystemPrompt(this.persona);
    const userMsg =
      `Current game state observation:\n\`\`\`json\n${obsText}\n\`\`\`\n\n` +
      "Call the submit_action tool with your orders for this turn.";

    const messages: Anthropic.MessageParam[] = [
      ...this.history,
      { role: "user", content: userMsg },
    ];

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 1024,
      system,
      tools: [ACTION_TOOL],
      tool_choice: { type: "any" },
      messages,
    });

    // Extract tool use input
    let action: object = {};
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "submit_action") {
        action = block.input as object;
        break;
      }
    }


    // Only push to history if the model actually submitted a meaningful action
    const hasContent = Object.values(action as Record<string, unknown>).some(
      (v) => v !== false && (Array.isArray(v) ? v.length > 0 : !!v),
    );
    if (hasContent) {
      const actionText = JSON.stringify(action, null, 2);
      this.history.push({ role: "user", content: userMsg });
      this.history.push({
        role: "assistant",
        content: `Action submitted:\n\`\`\`json\n${actionText}\n\`\`\``,
      });
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }
    }

    return action;
  }
}
