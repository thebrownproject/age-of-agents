"""
OpenAI GPT agent — uses response_format={"type":"json_object"} to enforce JSON.
"""
from __future__ import annotations
import json
import os

from agents.base import Agent
from prompts.builder import SYSTEM_PROMPT

ACTION_SCHEMA_DESCRIPTION = """
Respond with ONLY a JSON object (no markdown) with this exact schema:
{
  "train": [{"unit": "<UnitName>", "count": <int>}],
  "build": [{"building": "<BuildingName>"}],
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
"""


class OpenAIAgent(Agent):
    def __init__(self, model_id: str, persona: str = "balanced"):
        super().__init__(model_id, persona)
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "OPENAI_API_KEY is not set. "
                "Export it with: export OPENAI_API_KEY=sk-..."
            )
        try:
            from openai import OpenAI
            self._client = OpenAI(api_key=api_key)
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")
        self._history: list[dict] = []

    def get_action(self, observation: dict) -> dict:
        from openai import OpenAIError
        obs_text = json.dumps(observation, indent=2)
        system = SYSTEM_PROMPT.format(persona=self.persona) + "\n\n" + ACTION_SCHEMA_DESCRIPTION
        user_msg = (
            f"Current game state observation:\n```json\n{obs_text}\n```\n\n"
            "Output your action JSON now."
        )
        try:
            response = self._client.chat.completions.create(
                model=self.model_id,
                max_tokens=1024,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    *self._history,
                    {"role": "user", "content": user_msg},
                ],
            )
            content = response.choices[0].message.content or "{}"
            action = json.loads(content)
            # Update rolling history
            self._history.append({"role": "user", "content": user_msg})
            self._history.append({"role": "assistant", "content": content})
            if len(self._history) > 20:
                self._history = self._history[-20:]
            return action
        except (OpenAIError, json.JSONDecodeError) as e:
            raise RuntimeError(f"OpenAI API error: {e}") from e
