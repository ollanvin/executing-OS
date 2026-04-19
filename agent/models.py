from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class TaskSpec:
    id: str
    project: str
    type: str
    repoPath: str
    deviceId: str
    phoneNumber: str
    steps: list[str]
    status: str
    createdAt: str
    createdBy: str
    errorSummary: Optional[str] = None
    runStartedAt: Optional[str] = None
    buildPromptPath: Optional[str] = None

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "TaskSpec":
        raw_run = d.get("runStartedAt")
        if raw_run is None:
            run_started: Optional[str] = None
        elif isinstance(raw_run, str):
            run_started = raw_run
        else:
            run_started = str(raw_run)

        raw_bp = d.get("buildPromptPath")
        if raw_bp is None:
            build_prompt_path: Optional[str] = None
        elif isinstance(raw_bp, str):
            build_prompt_path = raw_bp
        else:
            build_prompt_path = str(raw_bp)

        return TaskSpec(
            id=d["id"],
            project=d["project"],
            type=d["type"],
            repoPath=d["repoPath"],
            deviceId=d["deviceId"],
            phoneNumber=d["phoneNumber"],
            steps=list(d["steps"]),
            status=d["status"],
            createdAt=d["createdAt"],
            createdBy=d["createdBy"],
            errorSummary=d.get("errorSummary"),
            runStartedAt=run_started,
            buildPromptPath=build_prompt_path,
        )

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "project": self.project,
            "type": self.type,
            "repoPath": self.repoPath,
            "deviceId": self.deviceId,
            "phoneNumber": self.phoneNumber,
            "steps": self.steps,
            "status": self.status,
            "createdAt": self.createdAt,
            "createdBy": self.createdBy,
        }
        if self.errorSummary is not None:
            out["errorSummary"] = self.errorSummary
        if self.runStartedAt is not None:
            out["runStartedAt"] = self.runStartedAt
        if self.buildPromptPath is not None:
            out["buildPromptPath"] = self.buildPromptPath
        return out


@dataclass
class StepResult:
    name: str
    exitCode: int


@dataclass
class ResultSpec:
    taskId: str
    status: str
    startedAt: str
    finishedAt: str
    artifactsDir: str
    errorSummary: Optional[str]
    steps: list[StepResult] = field(default_factory=list)
    buildPromptPath: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "taskId": self.taskId,
            "status": self.status,
            "errorSummary": self.errorSummary,
            "artifactsDir": self.artifactsDir,
            "steps": [{"name": s.name, "exitCode": s.exitCode} for s in self.steps],
            "startedAt": self.startedAt,
            "finishedAt": self.finishedAt,
        }
        if self.buildPromptPath is not None:
            out["buildPromptPath"] = self.buildPromptPath
        return out

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "ResultSpec":
        raw_bp = d.get("buildPromptPath")
        if raw_bp is None:
            build_prompt_path: Optional[str] = None
        elif isinstance(raw_bp, str):
            build_prompt_path = raw_bp
        else:
            build_prompt_path = str(raw_bp)

        steps_raw = d.get("steps", [])
        steps = [
            StepResult(name=x["name"], exitCode=int(x["exitCode"]))
            for x in steps_raw
        ]
        return ResultSpec(
            taskId=d["taskId"],
            status=d["status"],
            startedAt=d["startedAt"],
            finishedAt=d["finishedAt"],
            artifactsDir=d["artifactsDir"],
            errorSummary=d.get("errorSummary"),
            steps=steps,
            buildPromptPath=build_prompt_path,
        )
