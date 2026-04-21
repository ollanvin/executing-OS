export function OperatorEmptyState() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0f172a]/80 px-5 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-[15px] font-medium text-[#f3f4f6]">
        로컬 워크스테이션에서 실행할 작업을 자연어로 지시하세요.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#9ca3af]">
        Neo는 로컬 파일, 프로그램, 에뮬레이터, VM, 로그를{" "}
        <span className="text-[#d1d5db]">외부로 나가지 않고</span> 허용된 범위에서 다룹니다.
      </p>
      <ul className="mx-auto mt-5 max-w-lg space-y-1.5 text-left text-[12px] text-[#94a3b8]">
        <li className="flex gap-2">
          <span className="text-[#6b7280]">·</span>
          MyPhoneCheck 에뮬레이터 실행, 최근 로그 보여줘, 온보딩 화면 캡처
        </li>
        <li className="flex gap-2">
          <span className="text-[#6b7280]">·</span>
          이 폴더를 backup으로 옮겨줘 (경로 포함 · 승인 필요)
        </li>
        <li className="flex gap-2">
          <span className="text-[#6b7280]">·</span>
          adb devices 상태 확인해줘
        </li>
      </ul>
    </div>
  );
}
