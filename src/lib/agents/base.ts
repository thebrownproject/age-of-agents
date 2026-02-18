/**
 * Base agent interface and types
 */

export interface AgentConfig {
  modelId: string;
  persona: string;
  apiKey: string;
}

export interface Agent {
  getAction(observation: object): Promise<object>;
}
