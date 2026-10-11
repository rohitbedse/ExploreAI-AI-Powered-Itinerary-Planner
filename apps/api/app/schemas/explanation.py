"""Optional, read-only commentary on an already-validated Plan.

It references stops by id and never carries facts of its own: prices, durations, distances and
feasibility live only in ``Plan``. Internal for now (no route returns it yet).
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Sentence = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class StopExplanation(BaseModel):
    stop_id: str = Field(min_length=1, max_length=100)
    text: Sentence


class PlanExplanation(BaseModel):
    overview: Sentence
    stops: list[StopExplanation] = Field(default_factory=list, max_length=30)
    tradeoffs: list[Sentence] = Field(default_factory=list, max_length=5)
    # Things we do not know, stated plainly (opening hours, price accuracy, ...).
    unknowns: list[Sentence] = Field(default_factory=list, max_length=5)
    # "deterministic" = templated from plan data, no LLM involved.
    source: Literal["llm", "deterministic"]
