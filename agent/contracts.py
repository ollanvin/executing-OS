"""Minimal work-order contract for optional CLI integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WorkOrder:
    """Optional wrapper; pipeline primarily consumes plain JSON payloads."""

    title: str = ""
    body: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
