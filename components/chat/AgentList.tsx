'use client'
import { useState } from 'react'
import type { Agent } from '@/lib/types'
import type { ConversationStore } from '@/lib/conversations'
import { Skeleton } from '@/components/ui/skeleton'

interface AgentListProps {
  agents: Agent[]
  conversations: ConversationStore
  activeId: string | null
  onSelect: (agent: Agent) => void
  loading?: boolean
}

export function AgentList({ agents, conversations, activeId, onSelect, loading }: AgentListProps) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? agents.filter(a => {
        const q = search.toLowerCase()
        return a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)
      })
    : agents

  const sorted = [...filtered].sort((a, b) => {
    const ca = conversations[a.id]
    const cb = conversations[b.id]
    if (ca && cb) return cb.lastActivity - ca.lastActivity
    if (ca) return -1
    if (cb) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'var(--sidebar-backdrop)',
      WebkitBackdropFilter: 'var(--sidebar-backdrop)',
      borderRight: '1px solid var(--separator)',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--separator)',
        background: 'var(--material-regular)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)', margin: 0 }}>
          Messages
        </h2>
        <div style={{
          marginTop: 10,
          background: 'var(--fill-tertiary)',
          borderRadius: 12,
          padding: '7px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 14, color: 'var(--text-tertiary)', flexShrink: 0 }} aria-hidden="true">&#128269;</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            aria-label="Search agents"
            style={{
              flex: 1,
              fontSize: 14,
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
              margin: 0,
              lineHeight: 1.4,
            }}
          />
        </div>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }} role="listbox" aria-label="Agent list">
        {loading ? (
          /* Skeleton loaders while agents load */
          <div style={{ padding: '4px 0' }} role="status" aria-label="Loading agents">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <Skeleton className="rounded-full" style={{ width: 46, height: 46, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton style={{ width: '60%', height: 14 }} />
                  <Skeleton style={{ width: '85%', height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 && search.trim() ? (
          /* Empty state for no search results */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 13,
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}>
              No agents match &lsquo;{search.trim()}&rsquo;
            </div>
          </div>
        ) : (
          sorted.map(agent => {
            const conv = conversations[agent.id]
            const lastMsg = conv?.messages[conv.messages.length - 1]
            const unread = conv?.unread || 0
            const isActive = agent.id === activeId

            const preview = lastMsg
              ? lastMsg.content.replace(/[#*`]/g, '').slice(0, 55) + (lastMsg.content.length > 55 ? '\u2026' : '')
              : agent.description?.slice(0, 55) || 'Start a conversation'

            const timeLabel = lastMsg ? formatTime(lastMsg.timestamp) : ''

            return (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                role="option"
                aria-selected={isActive}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: isActive ? 'var(--accent-fill, rgba(255,255,255,0.12))' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 100ms ease',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--fill-secondary, rgba(255,255,255,0.06))' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${agent.color}cc, ${agent.color}55)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    boxShadow: isActive ? `0 0 0 2px var(--accent)` : 'none',
                    border: `2px solid ${agent.color}44`,
                  }}>
                    {agent.emoji}
                  </div>
                  <div style={{
                    position: 'absolute',
                    bottom: 1,
                    right: 1,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: 'var(--system-green, #30d158)',
                    border: '2px solid var(--bg, #000)',
                  }} />
                </div>

                {/* Text content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                    <span style={{
                      fontSize: 15,
                      fontWeight: unread > 0 ? 700 : 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 130,
                    }}>
                      {agent.name}
                    </span>
                    <span style={{ fontSize: 11, color: unread > 0 ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0, marginLeft: 4 }}>
                      {timeLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 13,
                      color: unread > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                      fontWeight: unread > 0 ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 160,
                    }}>
                      {lastMsg?.role === 'user' ? 'You: ' : ''}{preview}
                    </span>
                    {unread > 0 && (
                      <div style={{
                        flexShrink: 0,
                        marginLeft: 6,
                        background: 'var(--accent)',
                        color: '#000',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {unread > 9 ? '9+' : unread}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff/60000)}m`
  if (diff < 86400000) return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
