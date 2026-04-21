import type { ReactNode } from "react";

type SectionKey = "m1" | "m2" | "logs" | "neo";

type Props = {
  collapsed: boolean;
  onSelect: (key: SectionKey) => void;
};

export function CursorLikeSidebar({ collapsed, onSelect }: Props) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-white/[0.05] bg-[#0b1120]">
      <div
        className={[
          "shrink-0 border-b border-white/[0.05]",
          collapsed ? "px-1 py-2" : "px-3 py-3",
        ].join(" ")}
      >
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-[#e5e7eb]">
            H
          </div>
          {!collapsed && (
            <span className="truncate text-[13px] font-medium text-[#e5e7eb]">ollanvin/executing-OS</span>
          )}
        </div>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto py-3 ${collapsed ? "px-1" : "px-2"}`}>
        <SidebarSection title="QUICK TASKS" collapsed={collapsed}>
          <SidebarItem
            collapsed={collapsed}
            short="M1"
            title="M1 – WebStub / parity"
            onClick={() => onSelect("m1")}
          />
          <SidebarItem
            collapsed={collapsed}
            short="M2"
            title="M2 – MyPhoneCheck KR"
            onClick={() => onSelect("m2")}
          />
        </SidebarSection>
        <SidebarSection title="OPERATIONS" collapsed={collapsed}>
          <SidebarItem collapsed={collapsed} short="L" title="Logs" onClick={() => onSelect("logs")} />
          <SidebarItem
            collapsed={collapsed}
            short="N"
            title="Neo Runs"
            onClick={() => onSelect("neo")}
          />
        </SidebarSection>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      {!collapsed && (
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">
          {title}
        </p>
      )}
      <div className={`flex flex-col ${collapsed ? "items-center gap-1" : "gap-0.5"}`}>{children}</div>
    </div>
  );
}

function SidebarItem({
  short,
  title,
  onClick,
  collapsed,
}: {
  short: string;
  title: string;
  onClick: () => void;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-[#d1d5db] transition hover:bg-white/[0.06] hover:text-[#f9fafb]"
      >
        {short}
      </button>
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-[#d1d5db] transition hover:bg-white/[0.06] hover:text-[#f9fafb]"
    >
      {title}
    </button>
  );
}
