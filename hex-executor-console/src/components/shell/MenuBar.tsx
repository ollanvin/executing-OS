import { useEffect, useRef, useState, type ReactNode } from "react";
import { HEX_STATION_ICON } from "../../constants/assets";

type MenuId = "File" | "Edit" | "View" | "Help";

type Props = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function MenuBar({ sidebarOpen, onToggleSidebar }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openMenu == null) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [openMenu]);

  const toggleMenu = (id: MenuId) => {
    setOpenMenu((m) => (m === id ? null : id));
  };

  const closeMenu = () => setOpenMenu(null);

  return (
    <header
      ref={rootRef}
      className="relative z-50 flex h-8 shrink-0 items-center justify-between border-b border-white/[0.05] bg-[#0b1120] px-1.5 text-[12px] text-[#9ca3af]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Hide workspace sidebar" : "Show workspace sidebar"}
          className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#9ca3af] hover:bg-white/[0.06] hover:text-[#e5e7eb]"
          aria-expanded={sidebarOpen}
          aria-label="Toggle workspace sidebar"
        >
          <PanelToggleGlyph expanded={sidebarOpen} />
        </button>

        <nav className="flex items-center gap-0">
          <MenuTrigger
            id="File"
            openMenu={openMenu}
            onToggle={() => toggleMenu("File")}
            panel={
              <MenuPanel>
                <MenuRow
                  onClick={() => {
                    closeMenu();
                    window.location.reload();
                  }}
                >
                  Reload Hex Console
                </MenuRow>
              </MenuPanel>
            }
          />
          <MenuTrigger
            id="Edit"
            openMenu={openMenu}
            onToggle={() => toggleMenu("Edit")}
            panel={
              <MenuPanel>
                <MenuRowMuted>(UI only — no editor actions yet)</MenuRowMuted>
              </MenuPanel>
            }
          />
          <MenuTrigger
            id="View"
            openMenu={openMenu}
            onToggle={() => toggleMenu("View")}
            panel={
              <MenuPanel>
                <MenuRow
                  onClick={() => {
                    closeMenu();
                    onToggleSidebar();
                  }}
                >
                  Toggle Sidebar
                </MenuRow>
              </MenuPanel>
            }
          />
          <MenuTrigger
            id="Help"
            openMenu={openMenu}
            onToggle={() => toggleMenu("Help")}
            panel={
              <MenuPanel>
                <MenuRowMuted>(UI only — help docs TBD)</MenuRowMuted>
              </MenuPanel>
            }
          />
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 pr-0.5">
        <span className="hidden text-[11px] text-[#6b7280] sm:inline">
          Neo Local Operator Console
        </span>
        <button
          type="button"
          title="Hex station"
          className="rounded-full p-0.5 ring-1 ring-white/10 transition hover:ring-white/35 hover:shadow-[0_0_12px_rgba(255,255,255,0.12)]"
          aria-label="Station icon"
        >
          <img
            src={HEX_STATION_ICON}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
            width={28}
            height={28}
          />
        </button>
      </div>
    </header>
  );
}

function PanelToggleGlyph({ expanded }: { expanded: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="text-current">
      {expanded ? (
        <>
          <rect x="2" y="3" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="9" y="3" width="7" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </>
      ) : (
        <>
          <rect x="2" y="3" width="3" height="12" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
          <rect x="7" y="3" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}

function MenuTrigger({
  id,
  openMenu,
  onToggle,
  panel,
}: {
  id: MenuId;
  openMenu: MenuId | null;
  onToggle: () => void;
  panel: ReactNode;
}) {
  const open = openMenu === id;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={[
          "rounded px-2 py-1 transition",
          open
            ? "bg-white/[0.08] text-[#f9fafb] underline decoration-white/40 decoration-1 underline-offset-4"
            : "hover:bg-white/[0.06] hover:text-[#e5e7eb]",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {id}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-0.5 min-w-[200px] rounded-lg border border-white/[0.08] bg-[#111827] py-1 shadow-lg shadow-black/40"
          role="menu"
        >
          {panel}
        </div>
      )}
    </div>
  );
}

function MenuPanel({ children }: { children: ReactNode }) {
  return <div className="px-1">{children}</div>;
}

function MenuRow({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-[#e5e7eb] hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

function MenuRowMuted({ children }: { children: ReactNode }) {
  return (
    <div className="cursor-default rounded-md px-2.5 py-1.5 text-left text-[11px] italic text-[#6b7280]">
      {children}
    </div>
  );
}
