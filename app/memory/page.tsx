"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import type { MemoryFile } from "@/lib/types";
import { renderMarkdown, colorizeJson } from "@/lib/sanitize";
import { Skeleton } from "@/components/ui/skeleton";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selected, setSelected] = useState<MemoryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);

  function refresh() {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((data: MemoryFile[]) => {
        setFiles(data);
        if (data.length > 0 && !selected) setSelected(data[0]);
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  // ESC key to deselect file
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selected) {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  // Arrow key navigation in file list
  const handleFileListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (files.length === 0) return;
      const currentIndex = selected
        ? files.findIndex((f) => f.path === selected.path)
        : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = currentIndex < files.length - 1 ? currentIndex + 1 : 0;
        setSelected(files[nextIndex]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : files.length - 1;
        setSelected(files[prevIndex]);
      }
    },
    [files, selected]
  );

  // Auto-focus content area when file selected
  useEffect(() => {
    if (selected && contentRef.current) {
      contentRef.current.focus();
    }
  }, [selected]);

  const isJSON =
    selected?.label.includes("JSON") || selected?.path.endsWith(".json");

  let renderedContent: React.ReactNode = null;
  if (selected) {
    if (isJSON) {
      try {
        const pretty = JSON.stringify(JSON.parse(selected.content), null, 2);
        const lines = pretty.split("\n");
        renderedContent = (
          <div
            style={{
              background: "var(--fill-secondary)",
              borderRadius: "var(--radius-md)",
              padding: 16,
            }}
          >
            <div className="flex">
              {/* Line numbers */}
              <div
                className="flex-shrink-0 pr-4 mr-4 select-none"
                style={{
                  borderRight: "1px solid var(--separator)",
                }}
              >
                {lines.map((_, i) => (
                  <div
                    key={i}
                    className="font-mono text-[11px] leading-relaxed text-right min-w-[2.5ch]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              {/* Syntax highlighted content */}
              <pre
                className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed flex-1"
                style={{ color: "var(--text-secondary)" }}
                dangerouslySetInnerHTML={{
                  __html: colorizeJson(pretty),
                }}
              />
            </div>
          </div>
        );
      } catch {
        renderedContent = (
          <div
            style={{
              background: "var(--fill-secondary)",
              borderRadius: "var(--radius-md)",
              padding: 16,
            }}
          >
            <pre
              className="font-mono text-[13px] whitespace-pre-wrap"
              style={{ color: "var(--system-red)" }}
            >
              {selected.content}
            </pre>
          </div>
        );
      }
    } else {
      renderedContent = (
        <div
          className="text-[15px] leading-[1.7]"
          style={{ color: "var(--text-secondary)" }}
          dangerouslySetInnerHTML={{
            __html: `<p class="mb-3" style="color:var(--text-secondary)">${renderMarkdown(selected.content)}</p>`,
          }}
        />
      );
    }
  }

  const lineCount = selected ? selected.content.split("\n").length : 0;
  const words = selected ? wordCount(selected.content) : 0;

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      {/* Sidebar */}
      <div
        className="w-[240px] flex-shrink-0 flex flex-col"
        style={{
          background: "var(--material-regular)",
          backdropFilter: "var(--sidebar-backdrop)",
          WebkitBackdropFilter: "var(--sidebar-backdrop)",
          borderRight: "1px solid var(--separator)",
        }}
      >
        {/* Sidebar header */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--separator)",
          }}
        >
          <span
            className="text-[17px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Memory
          </span>
          <button
            onClick={refresh}
            className="hover:opacity-80 transition-opacity text-[16px]"
            style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
            aria-label="Refresh memory files"
          >
            &#8635;
          </button>
        </div>

        {/* File list */}
        <div
          ref={fileListRef}
          className="flex-1 overflow-y-auto"
          role="listbox"
          aria-label="Memory files"
          tabIndex={0}
          onKeyDown={handleFileListKeyDown}
        >
          {loading ? (
            <div className="p-4 flex flex-col gap-2" role="status" aria-label="Loading files">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col gap-1.5" style={{ padding: "4px 0" }}>
                  <Skeleton style={{ width: "75%", height: 14 }} />
                  <Skeleton style={{ width: "40%", height: 10 }} />
                </div>
              ))}
            </div>
          ) : (
            files.map((file) => {
              const isActive = selected?.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelected(file)}
                  role="option"
                  aria-selected={isActive}
                  className="w-full text-left transition-colors"
                  style={{
                    height: 52,
                    padding: "12px 16px",
                    background: isActive
                      ? "var(--fill-secondary)"
                      : undefined,
                    borderLeft: isActive
                      ? "3px solid var(--accent)"
                      : "3px solid transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.background =
                        "var(--material-ultra-thin)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.background = "";
                  }}
                >
                  <div
                    className="text-[14px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {file.label}
                  </div>
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {timeAgo(file.lastModified)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main content */}
      <div
        ref={contentRef}
        tabIndex={-1}
        className="flex-1 flex flex-col overflow-hidden"
        style={{ background: "var(--bg)", outline: "none" }}
      >
        {selected ? (
          <>
            {/* Content area */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ padding: "32px 40px" }}
            >
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                {/* File title */}
                <h1
                  className="text-[28px] font-bold"
                  style={{
                    color: "var(--text-primary)",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {selected.label}
                </h1>

                {/* Meta */}
                <div
                  className="text-[12px] mt-1 mb-6"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {isJSON ? (
                    <>
                      {lineCount} lines &middot; Modified{" "}
                      {timeAgo(selected.lastModified)}
                    </>
                  ) : (
                    <>
                      {words.toLocaleString()} words &middot;{" "}
                      {lineCount} lines &middot; Modified{" "}
                      {timeAgo(selected.lastModified)}
                    </>
                  )}
                </div>

                {/* Content */}
                {renderedContent}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span
              className="text-[15px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Select a file from the sidebar
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
