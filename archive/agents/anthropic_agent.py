"""
Anthropic Claude agent — uses tool_use to enforce JSON output.
"""
from __future__ import annotations
import json
import os

from agents.base import Agent
from prompts.builder import SYSTEM_PROMPT

ACTION_TOOL = {
    "name": "submit_action",
    "description": "Submit your strategic action for this turn.",
    "input_schema": {
        "type": "object",
        "properties": {
            "train": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "unit": {"type": "string"},
                        "count": {"type": "integer"},
                    },
                    "required": ["unit", "count"],
                },
            },
            "build": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"building": {"type": "string"}},
                    "required": ["building"],
                },
            },
            "move": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "unit": {"type": "string"},
                        "count": {"type": "integer"},
                        "from": {"type": "string"},
                        "to": {"type": "string"},
                    },
                    "required": ["unit", "count", "from", "to"],
                },
            },
            "attack": {
                "type": "array",
                "items": {"type": "object"},
            },
            "advance_age": {
                "type": "boolean",
                "description": "Set to true to advance to the next age (costs resources).",
            },
            "task_villagers": {
                "type": "object",
                "description": "Assign villagers to resource tasks. Keys: food, wood, gold. Values: number of villagers assigned.",
                "properties": {
                    "food": {"type": "integer"},
                    "wood": {"type": "integer"},
                    "gold": {"type": "integer"},
                },
            },
            "research": {
                "type": "array",
                "description": "List of upgrades to research at the Blacksmith.",
                "items": {
                    "type": "object",
                    "properties": {
                        "upgrade": {
                            "type": "string",
                            "enum": ["attack_1", "armor_1", "attack_2", "armor_2"],
                        },
                    },
                    "required": ["upgrade"],
                },
            },
        },
        "required": ["train", "build", "move", "attack"],
    },
}


class AnthropicAgent(Agent):
    def __init__(self, model_id: str, persona: str = "balanced"):
        super().__init__(model_id, persona)
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY is not set. "
                "Export it with: export ANTHROPIC_API_KEY=sk-ant-..."
            )
        try:
            import anthropic
            self._client = anthropic.Anthropic(api_key=api_key)
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")
        self._history: list[dict] = []

    def get_action(self, observation: dict) -> dict:
        import anthropic
        obs_text = json.dumps(observation, indent=2)
        system = SYSTEM_PROMPT.format(persona=self.persona)
        user_msg = (
            f"Current game state observation:\n```json\n{obs_text}\n```\n\n"
            "Call the submit_action tool with your orders for this turn."
        )
        try:
            messages = self._history + [{"role": "user", "content": user_msg}]
            response = self._client.messages.create(
                model=self.model_id,
                max_tokens=1024,
                system=system,
                tools=[ACTION_TOOL],
                tool_choice={"type": "any"},
                messages=messages,
            )
            # Extract tool use input
            action = {}
            for block in response.content:
                if block.type == "tool_use" and block.name == "submit_action":
                    action = block.input
                    break
            # Update rolling history (text summary avoids tool_result requirement)
            action_text = json.dumps(action, indent=2) if action else "{}"
            self._history.append({"role": "user", "content": user_msg})
            self._history.append({"role": "assistant", "content": f"Action submitted:\n```json\n{action_text}\n```"})
            if len(self._history) > 20:
                self._history = self._history[-20:]
            return action
        except anthropic.APIError as e:
            raise RuntimeError(f"Anthropic API error: {e}") from e
