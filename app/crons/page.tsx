"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Agent, CronJob } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "\u2014";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    const m = Math.floor(absDiff / 60000);
    const h = Math.floor(absDiff / 3600000);
    const dy = Math.floor(absDiff / 86400000);
    if (m < 60) return `in ${m}m`;
    if (h < 24) return `in ${h}h`;
    return `in ${dy}d`;
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function nextRunLabel(dateStr: string | null): string {
  if (!dateStr) return "not scheduled";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "\u2014";
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `in ${mins}m`;
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${days}d`;
}

type Filter = "all" | "ok" | "error" | "idle";

export default function CronsPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/crons").then((r) => {
        if (!r.ok) throw new Error(`Crons API: ${r.status}`);
        return r.json();
      }),
      fetch("/api/agents").then((r) => {
        if (!r.ok) throw new Error(`Agents API: ${r.status}`);
        return r.json();
      }),
    ])
      .then(([c, a]) => {
        if (Array.isArray(c)) setCrons(c);
        if (Array.isArray(a)) setAgents(a);
        setLastRefresh(new Date());
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const statusOrder: Record<string, number> = { error: 0, idle: 1, ok: 2 };
  const filtered = crons
    .filter((c) => filter === "all" || c.status === filter)
    .sort(
      (a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    );
  const counts = {
    all: crons.length,
    ok: crons.filter((c) => c.status === "ok").length,
    error: crons.filter((c) => c.status === "error").length,
    idle: crons.filter((c) => c.status === "idle").length,
  };

  const pills: {
    key: Filter;
    label: string;
    dotColor: string;
  }[] = [
    { key: "all", label: "All", dotColor: "var(--text-primary)" },
    { key: "ok", label: "Passing", dotColor: "var(--system-green)" },
    { key: "error", label: "Errors", dotColor: "var(--system-red)" },
    { key: "idle", label: "Idle", dotColor: "var(--text-tertiary)" },
  ];

  if (error && crons.length === 0) {
    return <ErrorState message={`Failed to load crons: ${error}`} onRetry={refresh} />;
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex-shrink-0 px-6 flex items-center justify-between"
        style={{
          height: 64,
          background: "var(--material-regular)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderBottom: "1px solid var(--separator)",
        }}
      >
        <div className="flex items-center gap-3">
          <h1
            className="text-[28px] font-bold"
            style={{
              color: "var(--text-primary)",
              letterSpacing: "-0.5px",
            }}
          >
            Cron Monitor
          </h1>
          <span
            className="text-[13px] font-medium rounded-full px-2.5 py-0.5"
            style={{
              background: "var(--fill-secondary)",
              color: "var(--text-secondary)",
            }}
          >
            {crons.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[12px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Updated {timeAgo(lastRefresh.toISOString())}
          </span>
          <button
            onClick={refresh}
            className="hover:opacity-80 transition-opacity text-[16px]"
            style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
            aria-label="Refresh cron data"
          >
            &#8635;
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-6 py-3 flex items-center gap-2 overflow-x-auto flex-shrink-0" role="tablist" aria-label="Filter cron jobs by status">
        {pills.map((pill) => {
          const isActive = filter === pill.key;
          return (
            <button
              key={pill.key}
              onClick={() => setFilter(pill.key)}
              role="tab"
              aria-selected={isActive}
              className="flex items-center gap-2 flex-shrink-0"
              style={{
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                transition: "all 200ms var(--ease-smooth)",
                ...(isActive
                  ? {
                      background: "var(--accent-fill)",
                      color: "var(--accent)",
                      boxShadow: "0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent)",
                    }
                  : {
                      background: "var(--fill-secondary)",
                      color: "var(--text-primary)",
                    }),
              }}
            >
              <span
                className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                  pill.key === "error" && counts.error > 0
                    ? "animate-error-pulse"
                    : ""
                }`}
                style={{ background: pill.dotColor }}
              />
              <span>{pill.label}</span>
              <span
                className="font-semibold"
                style={{
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {counts[pill.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cron list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div role="status" aria-label="Loading cron jobs" style={{
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            background: "var(--material-regular)",
            padding: "8px 16px",
          }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3" style={{
                minHeight: 44,
                borderTop: i > 1 ? "1px solid var(--separator)" : undefined,
                padding: "8px 0",
              }}>
                <Skeleton className="rounded-full" style={{ width: 8, height: 8, flexShrink: 0 }} />
                <Skeleton style={{ width: "35%", height: 14 }} />
                <div className="ml-auto flex items-center gap-3">
                  <Skeleton style={{ width: 60, height: 12 }} />
                  <Skeleton style={{ width: 70, height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex items-center justify-center h-32 text-[15px]"
            style={{ color: "var(--text-secondary)" }}
          >
            No crons match this filter
          </div>
        ) : (
          <div
            style={{
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--material-regular)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {filtered.map((cron, idx) => {
              const agent = cron.agentId
                ? agentMap.get(cron.agentId)
                : null;
              const isExpanded = expanded === cron.id;
              const isError = cron.status === "error";
              const isFirst = idx === 0;

              return (
                <div key={cron.id}>
                  {/* Separator between rows (not on first) */}
                  {!isFirst && (
                    <div
                      style={{
                        height: 1,
                        background: "var(--separator)",
                        marginLeft: 16,
                        marginRight: 16,
                      }}
                    />
                  )}

                  {/* Row */}
                  <div
                    onClick={() =>
                      setExpanded(isExpanded ? null : cron.id)
                    }
                    className="flex items-center cursor-pointer transition-colors"
                    role="button"
                    aria-expanded={isExpanded}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(isExpanded ? null : cron.id);
                      }
                    }}
                    style={{
                      minHeight: 44,
                      padding: "0 16px",
                      background: isError
                        ? "rgba(255,69,58,0.06)"
                        : undefined,
                      borderLeft: isError
                        ? "3px solid var(--system-red)"
                        : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isError)
                        e.currentTarget.style.background =
                          "var(--material-ultra-thin)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isError)
                        e.currentTarget.style.background = "";
                    }}
                  >
                    {/* Status dot */}
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        cron.status === "error" && counts.error > 0
                          ? "animate-error-pulse"
                          : ""
                      }`}
                      style={{
                        background:
                          cron.status === "ok"
                            ? "var(--system-green)"
                            : cron.status === "error"
                              ? "var(--system-red)"
                              : "var(--text-tertiary)",
                      }}
                    />

                    {/* Name */}
                    <span
                      className="text-[15px] font-medium ml-3 truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {cron.name}
                    </span>

                    {/* Right side: agent link, schedule, chevron */}
                    <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                      {agent ? (
                        <Link
                          href={`/chat/${agent.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[13px] hover:underline transition-colors"
                          style={{ color: "var(--system-blue)" }}
                        >
                          {agent.name}
                        </Link>
                      ) : (
                        <span
                          className="text-[13px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {"\u2014"}
                        </span>
                      )}

                      {/* Schedule */}
                      <span
                        className="text-[12px] font-mono"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {cron.schedule}
                      </span>

                      {/* Chevron */}
                      <span
                        className="text-[13px] transition-transform"
                        style={{
                          color: "var(--text-tertiary)",
                          transform: isExpanded
                            ? "rotate(90deg)"
                            : "rotate(0deg)",
                        }}
                        aria-hidden="true"
                      >
                        &#8250;
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 16px 12px 16px" }}>
                      {cron.lastError && (
                        <div
                          className="mt-2 px-4 py-3"
                          role="alert"
                          style={{
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(255,69,58,0.06)",
                            borderLeft:
                              "3px solid var(--system-red)",
                          }}
                        >
                          <pre
                            className="text-[13px] font-mono whitespace-pre-wrap"
                            style={{ color: "var(--system-red)" }}
                          >
                            {cron.lastError}
                          </pre>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                        <span
                          className="text-[12px]"
                          style={{
                            color: "var(--text-tertiary)",
                          }}
                        >
                          Last run: {timeAgo(cron.lastRun)}
                        </span>
                        <span
                          className="text-[12px]"
                          style={{
                            color: "var(--text-tertiary)",
                          }}
                        >
                          Next run: {nextRunLabel(cron.nextRun)}
                        </span>
                        <span
                          className="text-[12px] font-mono"
                          style={{
                            color: "var(--text-tertiary)",
                          }}
                        >
                          ID: {cron.id}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
