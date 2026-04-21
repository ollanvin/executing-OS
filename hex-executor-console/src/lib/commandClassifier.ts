/**
 * 백엔드 `parseCommand.ts`와 동일한 키워드 규칙을 유지하세요.
 * 오프라인 미리보기·백엔드 장애 시 폴백에 사용합니다.
 * mutation 메타는 `finalizeOperatorAction`으로 백엔드 `finalizeAction`과 동일 규칙을 적용합니다.
 */
import type {
  ActionCategory,
  MutationKind,
  OperatorAction,
  OperatorParsedAction,
} from "./neoOperatorTypes";

function id(): string {
  return crypto.randomUUID();
}

/** `.neo-policy.json` 의 highRiskActions 와 동기화 */
const POLICY_HIGH_RISK: MutationKind[] = [
  "FILE_DELETE",
  "FILE_MOVE",
  "APP_INSTALL",
  "APP_UPDATE",
  "VM_STATE_CHANGE",
  "EMULATOR_STATE_CHANGE",
];

function mutationMetaForIntent(intent: string): Pick<
  OperatorAction,
  "isMutating" | "backupRequired" | "mutationKind"
> {
  switch (intent) {
    case "file_move":
      return { mutationKind: "FILE_MOVE", isMutating: true, backupRequired: true };
    case "adb_screenshot":
      return { mutationKind: "FILE_CREATE", isMutating: true, backupRequired: true };
    case "myphonecheck_app_ready_screenshot":
    case "myphonecheck_capture_package":
      return { mutationKind: "FILE_CREATE", isMutating: true, backupRequired: true };
    case "myphonecheck_emulator":
    case "myphonecheck_app_launch":
      return { mutationKind: "EMULATOR_STATE_CHANGE", isMutating: true, backupRequired: true };
    case "vm_operation":
      return { mutationKind: "VM_STATE_CHANGE", isMutating: true, backupRequired: true };
    case "app_install_or_download":
      return { mutationKind: "APP_INSTALL", isMutating: true, backupRequired: true };
    case "app_launch":
    case "app_launch_generic":
      return { mutationKind: "APP_INSTALL", isMutating: true, backupRequired: true };
    default:
      return { mutationKind: "NONE", isMutating: false, backupRequired: false };
  }
}

export function finalizeOperatorAction(draft: OperatorParsedAction): OperatorAction {
  const meta = mutationMetaForIntent(draft.intent);
  const internalHighRisk =
    meta.isMutating && POLICY_HIGH_RISK.includes(meta.mutationKind);
  let requiresApproval = draft.requiresApproval;
  if (internalHighRisk && !requiresApproval) requiresApproval = true;
  return {
    ...draft,
    ...meta,
    internalHighRisk,
    requiresApproval,
  };
}

export function classifyOperatorCommand(rawText: string): OperatorParsedAction {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const avdPref =
    (import.meta.env.VITE_NEO_MYPHONECHECK_AVD as string | undefined)?.trim() || null;
  const pkgPref =
    (import.meta.env.VITE_NEO_MYPHONECHECK_PACKAGE as string | undefined)?.trim() || null;

  if (!text) {
    return unknown(text, "빈 명령입니다.");
  }

  const isMyPhoneCheck =
    /myphonecheck|마이폰첵|마이폰체크|my\s*phone\s*check/i.test(lower);

  if (
    isMyPhoneCheck &&
    /에뮬|emulator|이뮬/.test(lower) &&
    /온보드|온보딩|onboarding/i.test(text) &&
    /모듈/.test(lower) &&
    /사진|캡처|스크린샷|screenshot|찍/.test(lower) &&
    (/컨트롤\s*플레인|컨트롤플레인|전달할\s*파일|전달/.test(lower) ||
      /control\s*plane|delivery|bundle|패키지|번들/i.test(lower))
  ) {
    return {
      id: id(),
      rawText: text,
      category: "EMULATOR_OP",
      intent: "myphonecheck_capture_package",
      intentLabel: "MyPhoneCheck 컨트롤플레인 캡처 패키지",
      args: {
        appId: "MyPhoneCheck",
        package: pkgPref,
        scenarioId: null,
      },
      requiresApproval: false,
      executionSummary:
        "Neo golden path: 에뮬·앱·온보딩+모듈 캡처 → manifest(+zip) 컨트롤플레인 전달 패키지",
    };
  }

  if (
    isMyPhoneCheck &&
    /온보딩|onboarding|첫\s*화면|앱\s*준비|app\s*ready/i.test(lower) &&
    /캡처|스크린샷|screenshot|screencap|화면\s*캡처|사진\s*찍/.test(lower)
  ) {
    return {
      id: id(),
      rawText: text,
      category: "EMULATOR_OP",
      intent: "myphonecheck_app_ready_screenshot",
      intentLabel: "MyPhoneCheck 앱 준비 후 캡처",
      args: {
        appId: "MyPhoneCheck",
        package: pkgPref,
        scenarioId: null,
      },
      requiresApproval: false,
      executionSummary:
        "Neo composite: 디바이스 → 설치·기동·foreground → screencap (app_ready_screenshot)",
    };
  }

  if (/screenshot|스크린샷|화면\s*캡처|사진\s*찍|screencap|캡처해|스크린\s*캡처/.test(lower)) {
    return {
      id: id(),
      rawText: text,
      category: "EMULATOR_OP",
      intent: "adb_screenshot",
      intentLabel: "ADB 스크린샷",
      args: {},
      requiresApproval: false,
      executionSummary: "연결된 기기에서 adb exec-out screencap → PNG 저장",
    };
  }

  if (
    isMyPhoneCheck &&
    /실행|launch|open|run|띄워|켜\s*줘|열어줘|start|앱/.test(lower)
  ) {
    return {
      id: id(),
      rawText: text,
      category: "APP_OP",
      intent: "myphonecheck_app_launch",
      intentLabel: "MyPhoneCheck 앱 실행·foreground",
      args: {
        appId: "MyPhoneCheck",
        package: pkgPref,
        scenarioId: null,
      },
      requiresApproval: false,
      executionSummary:
        "Neo 워크플로: 디바이스 확보 → 설치 확인 → 앱 기동 → foreground 검증",
    };
  }

  if (
    (isMyPhoneCheck && /에뮬|emulator|이뮬/.test(lower)) ||
    /myphonecheck\s*emulator/.test(lower)
  ) {
    return {
      id: id(),
      rawText: text,
      category: "EMULATOR_OP",
      intent: "myphonecheck_emulator",
      intentLabel: "MyPhoneCheck 에뮬레이터 기동",
      args: { avd: avdPref },
      requiresApproval: false,
      executionSummary: "AVD 선택 → emulator 기동 → adb wait-for-device",
    };
  }

  if (/최근\s*로그|neo\s*runs|executor\s*logs|실행\s*로그|로그\s*보여|네오\s*로그/.test(lower)) {
    return {
      id: id(),
      rawText: text,
      category: "LOG_OP",
      intent: "recent_logs",
      intentLabel: "최근 runs 로그",
      args: {},
      requiresApproval: false,
      executionSummary: "runs/ 이하 최신 md·json 탐색 후 상위 줄 요약",
    };
  }

  if (
    /\bvm\b|가상\s*머신|virtual\s*machine|vm에서/.test(lower) &&
    /돌려|실행|시작|종료|켜|꺼/.test(lower)
  ) {
    return {
      id: id(),
      rawText: text,
      category: "VM_OP",
      intent: "vm_operation",
      intentLabel: "VM 작업",
      args: {},
      requiresApproval: true,
      executionSummary: "VM 시작/종료 또는 테스트 트리거 (로컬 승인 필요)",
    };
  }

  if (/설치\s*파일|\.msi|installer|다운로드\s*받아/.test(lower)) {
    return {
      id: id(),
      rawText: text,
      category: "APP_OP",
      intent: "app_install_or_download",
      intentLabel: "설치/다운로드",
      args: {},
      requiresApproval: true,
      executionSummary: "설치 프로그램 실행 또는 외부 다운로드 (승인 필요)",
    };
  }

  if (/notepad|메모장/.test(lower) && /열어|실행|켜/.test(lower)) {
    return {
      id: id(),
      rawText: text,
      category: "APP_OP",
      intent: "app_launch",
      intentLabel: "프로그램 실행",
      args: { program: "notepad" },
      requiresApproval: true,
      executionSummary: "notepad.exe 실행 (승인 필요)",
    };
  }

  if (/옮겨|이동해|move\s+to|다음\s*폴더로|복사해|삭제해|이름\s*바꿔/.test(lower)) {
    const paths = extractPaths(text);
    return {
      id: id(),
      rawText: text,
      category: "FILE_OP",
      intent: "file_move",
      intentLabel: "파일/폴더 이동·복사",
      args: {
        source: paths[0] ?? null,
        destination: paths[1] ?? null,
        overwrite: /덮어|overwrite|replace/.test(lower),
      },
      requiresApproval: true,
      executionSummary: `소스 → 목적지 파일 작업 (소스: ${paths[0] ?? "미지정"}, 목적: ${paths[1] ?? "미지정"})`,
    };
  }

  if (
    /adb|에뮬.*떠|emulator.*running|연결\s*확인|디바이스\s*목록|프로세스|디스크|환경\s*변수/.test(lower)
  ) {
    return {
      id: id(),
      rawText: text,
      category: "SYSTEM_OP",
      intent: "system_status",
      intentLabel: "시스템·디바이스 상태",
      args: {},
      requiresApproval: false,
      executionSummary: "adb devices / 에뮬레이터 프로세스 등 로컬 상태 조회",
    };
  }

  if (/실행해|열어|켜\s*줘|start\s+/i.test(text) && /프로그램|앱/.test(lower)) {
    return {
      id: id(),
      rawText: text,
      category: "APP_OP",
      intent: "app_launch_generic",
      intentLabel: "앱 실행 (일반)",
      args: {},
      requiresApproval: true,
      executionSummary: "지정 프로그램 실행 (승인 필요)",
    };
  }

  return unknown(
    text,
    "패턴이 명확하지 않습니다. 예: MyPhoneCheck 에뮬레이터 돌려줘 / 최근 로그 보여줘 / 화면 캡처",
  );
}

function extractPaths(text: string): string[] {
  const win = text.match(/[a-zA-Z]:\\(?:[^<>:"|?*\n\r]+\\)*[^<>:"|?*\n\r]*/g);
  if (win?.length) return win;
  const q = text.match(/"([^"]+)"/g);
  if (q) return q.map((s) => s.slice(1, -1));
  return [];
}

function unknown(rawText: string, hint: string): OperatorParsedAction {
  return {
    id: id(),
    rawText,
    category: "SYSTEM_OP",
    intent: "unknown",
    intentLabel: "미분류",
    args: { hint },
    requiresApproval: false,
    executionSummary: hint,
  };
}

export function categoryLabel(c: ActionCategory): string {
  const map: Record<ActionCategory, string> = {
    FILE_OP: "FILE_OP · 파일",
    APP_OP: "APP_OP · 프로그램",
    EMULATOR_OP: "EMULATOR_OP · 에뮬레이터",
    VM_OP: "VM_OP · 가상머신",
    LOG_OP: "LOG_OP · 로그",
    SYSTEM_OP: "SYSTEM_OP · 시스템",
  };
  return map[c];
}
