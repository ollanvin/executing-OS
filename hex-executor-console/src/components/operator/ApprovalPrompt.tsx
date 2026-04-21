type Props = {
  onApprove: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function ApprovalPrompt({ onApprove, onCancel, disabled }: Props) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3">
      <p className="text-[13px] font-medium text-[#fcd34d]">다음 작업을 실행할까요?</p>
      <p className="mt-1 text-[12px] text-[#9ca3af]">
        쓰기·삭제·설치·VM 등은 로컬 승인 후에만 진행됩니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onApprove}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-[#111827] hover:bg-amber-400 disabled:opacity-40"
        >
          승인
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#e5e7eb] hover:bg-white/[0.08] disabled:opacity-40"
        >
          취소
        </button>
      </div>
    </div>
  );
}
