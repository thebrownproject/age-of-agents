"""
Abstract Agent base class.
"""
from __future__ import annotations
from abc import ABC, abstractmethod


class Agent(ABC):
    def __init__(self, model_id: str, persona: str = "balanced"):
        self.model_id = model_id
        self.persona = persona

    @abstractmethod
    def get_action(self, observation: dict) -> dict:
        """
        Given an observation dict, return an action dict with keys:
        train, build, move, attack.
        """
        ...
