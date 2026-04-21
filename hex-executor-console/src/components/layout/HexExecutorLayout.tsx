import { useCallback, useState } from "react";
import { MainWorkArea } from "../main/MainWorkArea";
import { MenuBar } from "../shell/MenuBar";
import { CursorLikeSidebar } from "../sidebar/CursorLikeSidebar";

/** 보조 패널: 빠른 명령 템플릿만 프리필합니다. 제품 중심은 중앙 명령창입니다. */
const PREFILL = {
  m1: "M1 WebStub US 스모크 실행해줘",
  m2: "MyPhoneCheck 에뮬레이터 돌려줘",
  logs: "최근 Neo 실행 로그 보여줘",
  neo: "executor 최근 runs 폴더 요약해줘",
} as const;

type SectionKey = keyof typeof PREFILL;

export function HexExecutorLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);

  const onSection = useCallback((key: SectionKey) => {
    setPrefill(PREFILL[key]);
  }, []);

  const consumePrefill = useCallback(() => {
    setPrefill(null);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => !o);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#020617] text-[#e5e7eb]">
      <MenuBar sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      <div
        className={
          sidebarOpen
            ? "grid min-h-0 min-w-0 flex-1 grid-cols-[260px_minmax(0,1fr)]"
            : "grid min-h-0 min-w-0 flex-1 grid-cols-[56px_minmax(0,1fr)]"
        }
      >
        <CursorLikeSidebar collapsed={!sidebarOpen} onSelect={onSection} />
        <MainWorkArea prefillRequest={prefill} onConsumePrefill={consumePrefill} />
      </div>
    </div>
  );
}
