"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Hand,
  MoreHorizontal,
  X,
} from "lucide-react";
import type { ToolPermissionMode } from "@/lib/tool-permissions";

export type McpToolSummary = {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
};

type GroupKey = "read" | "write";
type GroupMode = ToolPermissionMode | "custom";

const MODE_META: Record<
  GroupMode,
  { label: string; Icon: typeof CheckCircle2 }
> = {
  always_allow: { label: "Always allow", Icon: CheckCircle2 },
  needs_approval: { label: "Needs approval", Icon: Hand },
  blocked: { label: "Blocked", Icon: Ban },
  custom: { label: "Custom", Icon: MoreHorizontal },
};

const TOOL_MODES: ToolPermissionMode[] = [
  "always_allow",
  "needs_approval",
  "blocked",
];

function defaultModeForSummary(t: McpToolSummary): ToolPermissionMode {
  return t.readOnly ? "always_allow" : "needs_approval";
}

function resolveMode(
  tool: McpToolSummary,
  permissions: Record<string, ToolPermissionMode>,
): ToolPermissionMode {
  return permissions[tool.name] ?? defaultModeForSummary(tool);
}

function computeGroupMode(
  tools: McpToolSummary[],
  permissions: Record<string, ToolPermissionMode>,
): GroupMode {
  if (tools.length === 0) return "always_allow";
  const first = resolveMode(tools[0], permissions);
  for (let i = 1; i < tools.length; i++) {
    if (resolveMode(tools[i], permissions) !== first) return "custom";
  }
  return first;
}

function ToolPermissionPicker({
  mode,
  onChange,
}: {
  mode: ToolPermissionMode;
  onChange: (m: ToolPermissionMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="flex items-center gap-0.5"
    >
      {TOOL_MODES.map(m => {
        const active = m === mode;
        const { label, Icon } = MODE_META[m];
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => !active && onChange(m)}
            className={`group relative flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              active
                ? m === "always_allow"
                  ? "bg-[#4CAF6E]/15 text-[#4CAF6E]"
                  : m === "needs_approval"
                    ? "bg-[#D4882A]/15 text-[#D4882A]"
                    : "bg-[#C45D4A]/15 text-[#C45D4A]"
                : "text-[#8b8b89] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span
              role="tooltip"
              className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1A1917] px-2 py-1 text-[11px] text-[#E8E4DD] opacity-0 shadow-md ring-1 ring-[#3D3C36] transition-opacity group-hover:opacity-100"
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GroupDropdown({
  mode,
  onBulkChange,
}: {
  mode: GroupMode;
  onBulkChange: (m: ToolPermissionMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = MODE_META[mode];
  const options: GroupMode[] = ["always_allow", "needs_approval", "blocked", "custom"];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-1.5 text-xs text-[#E8E4DD] transition-colors hover:border-[#5a5955] hover:bg-[#24231F]"
      >
        <current.Icon className="h-3.5 w-3.5 text-[#C4C0B6]" strokeWidth={1.75} />
        <span>{current.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#8b8b89]" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[180px] overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917] py-1 shadow-xl"
        >
          {options.map(opt => {
            const meta = MODE_META[opt];
            const active = opt === mode;
            const disabled = opt === "custom";
            return (
              <button
                key={opt}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onBulkChange(opt as ToolPermissionMode);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                  disabled
                    ? "cursor-default text-[#8b8b89]"
                    : "text-[#E8E4DD] hover:bg-[#24231F]"
                } ${active ? "bg-[#24231F]" : ""}`}
              >
                <meta.Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="flex-1">{meta.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-[#4CAF6E]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  tools,
  permissions,
  onUpdate,
}: {
  label: string;
  tools: McpToolSummary[];
  permissions: Record<string, ToolPermissionMode>;
  onUpdate: (updates: Array<{ toolName: string; mode: ToolPermissionMode }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const mode = useMemo(() => computeGroupMode(tools, permissions), [tools, permissions]);

  if (tools.length === 0) return null;

  return (
    <div className="border-b border-[#3D3C36] last:border-b-0">
      <div className="flex items-center justify-between gap-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="group flex min-w-0 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-[#8b8b89] transition-colors group-hover:text-[#E8E4DD]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#8b8b89] transition-colors group-hover:text-[#E8E4DD]" />
          )}
          <span className="text-sm font-medium text-[#E8E4DD]">{label}</span>
          <span className="font-mono text-[11px] text-[#8b8b89]">{tools.length}</span>
        </button>
        <GroupDropdown mode={mode} onBulkChange={next => {
          onUpdate(tools.map(t => ({ toolName: t.name, mode: next })));
        }} />
      </div>
      {open && (
        <div className="divide-y divide-[#3D3C36] border-t border-[#3D3C36] pb-1">
          {tools.map(tool => {
            const current = resolveMode(tool, permissions);
            return (
              <div
                key={tool.name}
                className="flex items-start justify-between gap-4 py-3 pl-6 pr-1"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm text-[#E8E4DD]">{tool.name}</div>
                  {tool.description && (
                    <div className="mt-1 text-xs leading-relaxed text-[#8b8b89]">
                      {tool.description}
                    </div>
                  )}
                </div>
                <ToolPermissionPicker
                  mode={current}
                  onChange={next => onUpdate([{ toolName: tool.name, mode: next }])}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function McpToolsSheet({
  open,
  onClose,
  tools,
  permissions,
  loading,
  error,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  tools: McpToolSummary[] | null;
  permissions: Record<string, ToolPermissionMode>;
  loading: boolean;
  error: string | null;
  onUpdate: (updates: Array<{ toolName: string; mode: ToolPermissionMode }>) => void;
}) {
  const groups = useMemo(() => {
    const list = tools ?? [];
    return {
      read: list.filter(t => t.readOnly),
      write: list.filter(t => !t.readOnly),
    } as Record<GroupKey, McpToolSummary[]>;
  }, [tools]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 flex h-[85vh] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#3D3C36] bg-[#24231F] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-6 border-b border-[#3D3C36] px-6 pt-5 pb-4">
          <div>
            <h2 className="text-sm font-medium text-[#E8E4DD]">Tool permissions</h2>
            <p className="mt-1 text-xs text-[#8b8b89]">
              Choose when the agent is allowed to use these tools.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-[#C4C0B6] transition-colors hover:bg-[#2E2D28] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {error && (
            <div className="my-4 rounded-lg bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
              {error}
            </div>
          )}
          {loading && !tools && (
            <div className="flex items-center justify-center py-16 text-sm text-[#8b8b89]">
              Loading tools…
            </div>
          )}
          {tools && tools.length > 0 && (
            <div>
              <Group
                label="Read-only tools"
                tools={groups.read}
                permissions={permissions}
                onUpdate={onUpdate}
              />
              <Group
                label="Write/delete tools"
                tools={groups.write}
                permissions={permissions}
                onUpdate={onUpdate}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
