"use client";

import type { ElementType, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";

// ── Markdown rendering ──────────────────────────────────────────────

export function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern =
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const matches = text.split(pattern).filter(Boolean);

  return matches.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-[0.95em] text-white"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-[#4CAF6E] underline underline-offset-4 hover:text-[#3D9A5C]"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFenceMatch = /^```(\w+)?\s*$/.exec(line);
    if (codeFenceMatch) {
      const language = codeFenceMatch[1];
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;

      nodes.push(
        <pre
          key={`code-${nodes.length}`}
          className="overflow-x-auto rounded border border-[#3D3C36] bg-[#24231F] p-4 text-sm leading-6 text-white"
        >
          {language ? (
            <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[#9B9689]">
              {language}
            </div>
          ) : null}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const className =
        level === 1
          ? "text-3xl font-semibold text-white"
          : level === 2
            ? "text-2xl font-semibold text-white"
            : level === 3
              ? "text-xl font-semibold text-white"
              : "text-base font-semibold text-white";
      const Tag = `h${Math.min(level, 6)}` as ElementType;
      nodes.push(
        <Tag key={`heading-${nodes.length}`} className={className}>
          {renderInlineMarkdown(headingMatch[2], `heading-${nodes.length}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^([-*_]){3,}\s*$/.test(line.trim())) {
      nodes.push(<hr key={`hr-${nodes.length}`} className="border-[#3D3C36]" />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(
        <blockquote
          key={`quote-${nodes.length}`}
          className="border-l-2 border-[#3D3C36] pl-4 text-white"
        >
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={`quote-line-${quoteIndex}`}>
              {renderInlineMarkdown(quoteLine, `quote-${quoteIndex}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="list-disc space-y-2 pl-6 text-white">
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>
              {renderInlineMarkdown(item, `ul-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${nodes.length}`} className="list-decimal space-y-2 pl-6 text-white">
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>
              {renderInlineMarkdown(item, `ol-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^[-*+]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index]) &&
      !/^([-*_]){3,}\s*$/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    nodes.push(
      <p key={`p-${nodes.length}`} className="text-base leading-7 text-white">
        {renderInlineMarkdown(paragraphLines.join(" "), `p-${nodes.length}`)}
      </p>,
    );
  }

  return nodes;
}

// ── Chat UI components ──────────────────────────────────────────────

/** Pretty-print a tool name: "listCampaigns" → "List Campaigns" */
function formatToolName(name: string): string {
  return name
    .replace(/^(get|list|run|search|create|update|pause|enable|remove|add|bulk|set|undo|rename|move|upload)/, "$1 ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

type ToolPart = Extract<GoogleAdsAgentUIMessage["parts"][number], { type: string }>;

function ToolGroupBlock({
  parts,
  messageId,
}: {
  parts: ToolPart[];
  messageId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedTool, setExpandedTool] = useState<number | null>(null);

  const DONE_STATES = new Set(["output-available", "output-error", "output-denied"]);
  const isDone = (p: ToolPart) => "state" in p && DONE_STATES.has(p.state as string);

  const allDone = parts.every(isDone);
  const toolNames = parts.map(p => formatToolName(p.type.replace("tool-", "")));

  if (!allDone) {
    // Thinking / running state
    const completedCount = parts.filter(isDone).length;
    const currentTool = parts.find(p => !isDone(p));
    const currentName = currentTool
      ? formatToolName(currentTool.type.replace("tool-", ""))
      : "";

    return (
      <div className="flex items-center gap-2 py-0.5 text-sm text-[#8b8b89]">
        <span>
          {currentName}
          {parts.length > 1 && completedCount > 0
            ? ` (${completedCount + 1}/${parts.length})`
            : ""}
          <ThinkingDots />
        </span>
      </div>
    );
  }

  // Completed state — simple text link like Claude
  const summary =
    parts.length === 1
      ? toolNames[0]
      : toolNames.join(", ");

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="text-left text-sm text-[#8b8b89] underline decoration-[#8b8b89]/30 underline-offset-4 transition-colors hover:text-[#b0b0ae]"
      >
        {summary}
        {isOpen ? (
          <ChevronDown className="ml-1 inline h-3 w-3" />
        ) : (
          <ChevronRight className="ml-1 inline h-3 w-3" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1">
          {parts.map((part, i) => {
            const isExpanded = expandedTool === i;
            return (
              <div key={`${messageId}-tool-${i}`}>
                {parts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpandedTool(isExpanded ? null : i)}
                    className="flex items-center gap-1.5 py-1 text-xs text-[#8b8b89] transition-colors hover:text-[#b0b0ae]"
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>{toolNames[i]}</span>
                  </button>
                )}
                {(isExpanded || parts.length === 1) && (
                  <pre className={`mt-1 max-h-60 overflow-auto rounded-lg bg-[#2c2c2b] p-3 text-xs leading-5 ${
                    "state" in part && part.state === "output-error"
                      ? "text-[#C45D4A]/80"
                      : "text-white/60"
                  }`}>
                    {"errorText" in part && part.errorText
                      ? String(part.errorText)
                      : JSON.stringify(
                          "output" in part ? part.output : null,
                          null,
                          2,
                        )}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Group consecutive tool parts together, interleaving with text parts.
 * Returns an array of { type: "text", ... } or { type: "tool-group", parts: [...] }.
 */
function groupMessageParts(parts: GoogleAdsAgentUIMessage["parts"]) {
  const groups: (
    | { kind: "text"; part: (typeof parts)[number]; index: number }
    | { kind: "tool-group"; parts: ToolPart[]; startIndex: number }
  )[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type.startsWith("tool-")) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.kind === "tool-group") {
        lastGroup.parts.push(part as ToolPart);
      } else {
        groups.push({ kind: "tool-group", parts: [part as ToolPart], startIndex: i });
      }
    } else {
      groups.push({ kind: "text", part, index: i });
    }
  }

  return groups;
}

function ThinkingDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount(c => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span>{".".repeat(count)}</span>;
}

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <Sparkles className="h-3.5 w-3.5 animate-pulse text-[#4CAF6E]" />
      <span className="text-sm text-[#E8E4DD]/70">
        Thinking<ThinkingDots />
      </span>
    </div>
  );
}

export function Message({
  message,
  isActivelyStreaming = false,
}: {
  message: GoogleAdsAgentUIMessage;
  isActivelyStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const groups = groupMessageParts(message.parts);

  // Show thinking indicator at the end of the assistant message while streaming,
  // UNTIL the final text part is actively streaming out.
  const lastPart = message.parts[message.parts.length - 1];
  const finalTextIsStreaming = lastPart?.type === "text" && lastPart.text.length > 0;
  const showThinking = !isUser && isActivelyStreaming && !finalTextIsStreaming;

  if (isUser) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-3xl bg-[#2c2c2b] px-5 py-3">
            {groups.map(group => {
              if (group.kind !== "text" || group.part.type !== "text") return null;
              return (
                <div
                  key={`${message.id}-${group.index}`}
                  className="text-base leading-7 text-white"
                >
                  {renderInlineMarkdown(group.part.text, `${message.id}-${group.index}`)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
      <div className="space-y-3">
        {groups.map(group => {
          if (group.kind === "text") {
            const part = group.part;
            if (part.type !== "text") return null;
            return (
              <div
                key={`${message.id}-${group.index}`}
                className="space-y-4 text-base leading-7 text-white"
              >
                {renderMarkdown(part.text)}
              </div>
            );
          }
          return (
            <ToolGroupBlock
              key={`${message.id}-tools-${group.startIndex}`}
              parts={group.parts}
              messageId={message.id}
            />
          );
        })}
        {showThinking && <ThinkingIndicator />}
      </div>
    </div>
  );
}
