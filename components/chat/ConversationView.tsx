'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Agent } from '@/lib/types'
import type { Conversation, ConversationStore, Message, MediaAttachment } from '@/lib/conversations'
import { parseMedia, addMessage, updateLastMessage } from '@/lib/conversations'

interface ConversationViewProps {
  agent: Agent
  conversation: Conversation
  onUpdate: (agentId: string, updater: (prev: ConversationStore) => ConversationStore) => void
}

/* ── Markdown formatting (from existing chat) ────────────── */

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\*([^*]+)\*)/g
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[0].startsWith('**')) {
      parts.push(<strong key={match.index} style={{ fontWeight: 700 }}>{match[2]}</strong>)
    } else if (match[0].startsWith('`')) {
      parts.push(
        <code key={match.index} style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 5,
          padding: '1px 5px',
          fontSize: '0.88em',
          fontFamily: 'SF Mono, Menlo, monospace',
        }}>{match[3]}</code>
      )
    } else if (match[0].startsWith('*')) {
      parts.push(<em key={match.index} style={{ fontStyle: 'italic', opacity: 0.85 }}>{match[4]}</em>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function formatMessage(content: string): React.ReactNode {
  if (!content) return null
  const lines = content.split('\n')
  const result: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLines = []
      } else {
        inCodeBlock = false
        result.push(
          <pre key={i} style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12,
            fontFamily: 'SF Mono, Menlo, monospace',
            overflowX: 'auto',
            margin: '6px 0',
            color: '#e2e8f0',
            lineHeight: 1.6,
          }}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        )
        codeLines = []
      }
      continue
    }
    if (inCodeBlock) { codeLines.push(line); continue }
    if (line.trim() === '') { result.push(<div key={`space-${i}`} style={{ height: 6 }} />); continue }
    if (line.match(/^[-*] /)) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>&bull;</span>
          <span>{inlineFormat(line.slice(2))}</span>
        </div>
      )
      continue
    }
    if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: 600, minWidth: 16 }}>{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
      continue
    }
    if (line.startsWith('### ')) { result.push(<div key={i} style={{ fontWeight: 600, fontSize: 14, marginTop: 8, marginBottom: 2 }}>{inlineFormat(line.slice(4))}</div>); continue }
    if (line.startsWith('## ')) { result.push(<div key={i} style={{ fontWeight: 700, fontSize: 15, marginTop: 10, marginBottom: 3 }}>{inlineFormat(line.slice(3))}</div>); continue }
    result.push(<div key={i} style={{ marginBottom: 1 }}>{inlineFormat(line)}</div>)
  }
  return <>{result}</>
}

function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function shouldShowAvatar(messages: Message[], index: number): boolean {
  if (index === 0) return true
  return messages[index - 1].role !== messages[index].role
}

/* ── Component ──────────────────────────────────────────── */

export function ConversationView({ agent, conversation, onUpdate }: ConversationViewProps) {
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const messages = conversation?.messages || []
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return
    const text = input.trim()
    setInput('')

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const assistantMsgId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }

    // Add both messages to store
    onUpdate(agent.id, prev => {
      let next = addMessage(prev, agent.id, userMsg)
      next = addMessage(next, agent.id, assistantMsg)
      return next
    })

    setIsStreaming(true)

    // Build message history for API (role + content only)
    // Use ref to read the latest messages and avoid stale closure on concurrent sends
    const apiMessages = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch(`/api/chat/${agent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(line.slice(6))
              if (chunk.content) {
                fullContent += chunk.content
                const capturedContent = fullContent
                onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, capturedContent, true))
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }

      // Mark streaming done
      const finalContent = fullContent
      onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, finalContent, false))
    } catch {
      onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, 'Error getting response. Check API connection.', false))
    } finally {
      setIsStreaming(false)
      textareaRef.current?.focus()
    }
  }, [input, isStreaming, agent.id, onUpdate])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      textareaRef.current?.blur()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const isImage = file.type.startsWith('image/')
    const isAudio = file.type.startsWith('audio/')
    const media: MediaAttachment[] = [{
      type: isImage ? 'image' : isAudio ? 'audio' : 'file',
      url,
      name: file.name,
    }]
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: isImage ? `[Attached: ${file.name}]` : `[File: ${file.name}]`,
      timestamp: Date.now(),
      media,
    }
    onUpdate(agent.id, prev => addMessage(prev, agent.id, msg))
    e.target.value = ''
  }

  function clearChat() {
    onUpdate(agent.id, prev => ({
      ...prev,
      [agent.id]: {
        agentId: agent.id,
        messages: [{
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: `I'm ${agent.name}. ${agent.description} What do you need?`,
          timestamp: Date.now(),
        }],
        unread: 0,
        lastActivity: Date.now(),
      }
    }))
  }

  const hasInput = input.trim().length > 0

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Color stripe */}
      <div style={{ height: 3, width: '100%', flexShrink: 0, backgroundColor: agent.color }} />

      {/* Header */}
      <div style={{
        background: 'var(--material-regular)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        borderBottom: '1px solid var(--separator)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 44 }}>
          <div style={{ width: 20 }} />
          <button
            onClick={clearChat}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h14" /><path d="M8 5V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V5" />
              <path d="M5 5l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12" />
              <path d="M8.5 9v5" /><path d="M11.5 9v5" />
            </svg>
          </button>
        </div>

        {/* Agent identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 16, gap: 8 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: `linear-gradient(135deg, ${agent.color}cc, ${agent.color}66)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            boxShadow: `0 0 0 3px ${agent.color}33, 0 4px 16px rgba(0,0,0,0.4)`,
            border: `2px solid ${agent.color}66`,
          }}>
            {agent.emoji}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              {agent.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
              {agent.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--system-green, #30d158)' }} />
              <span style={{ fontSize: 11, color: 'var(--system-green, #30d158)' }}>Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#000', padding: '20px 16px 80px 16px' }}>
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const showAvatar = shouldShowAvatar(messages, i)
          const isLastAssistant = !isUser && i === messages.length - 1 && (isStreaming || msg.isStreaming)
          const media = msg.media || parseMedia(msg.content)

          // Strip media URLs from text for display
          let textContent = msg.content
          if (media.length > 0 && !msg.media) {
            media.forEach(m => {
              textContent = textContent.replace(m.url, '')
              textContent = textContent.replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
            })
            textContent = textContent.trim()
          }

          return (
            <div key={msg.id || i} style={{ animation: 'fadeIn 0.2s ease' }}>
              {i > 0 && <div style={{ height: messages[i - 1].role !== msg.role ? 16 : 3 }} />}

              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                justifyContent: isUser ? 'flex-end' : 'flex-start',
              }}>
                {/* Assistant avatar */}
                {!isUser && (
                  <div style={{ flexShrink: 0, width: 36 }}>
                    {showAvatar ? (
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${agent.color}cc, ${agent.color}66)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        border: `1.5px solid ${agent.color}55`,
                      }}>
                        {agent.emoji}
                      </div>
                    ) : <div style={{ width: 36 }} />}
                  </div>
                )}

                {/* Bubble column */}
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '72%' }}>
                  {showAvatar && !isUser && (
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 3, marginLeft: 14 }}>
                      {agent.name}
                    </div>
                  )}
                  {showAvatar && isUser && (
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 3, marginRight: 14, textAlign: 'right' }}>
                      You
                    </div>
                  )}

                  {/* Text bubble */}
                  {(textContent || isLastAssistant) && (
                    <div style={{
                      padding: '10px 14px',
                      fontSize: 15,
                      lineHeight: 1.45,
                      ...(isUser
                        ? {
                            background: 'var(--accent)',
                            color: '#000',
                            fontWeight: 500,
                            borderRadius: '20px 20px 4px 20px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                          }
                        : {
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.10)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            borderRadius: '20px 20px 20px 4px',
                            color: '#fff',
                          }),
                    }}>
                      {formatMessage(textContent)}
                      {isLastAssistant && (
                        <span style={{ color: 'var(--accent)', animation: 'blink 1s step-end infinite', marginLeft: 2 }}>&#9612;</span>
                      )}
                    </div>
                  )}

                  {/* Image attachments */}
                  {media.filter(m => m.type === 'image').map((m, mi) => (
                    <div key={mi} style={{ marginTop: 6, borderRadius: 16, overflow: 'hidden', maxWidth: 280 }}>
                      <img
                        src={m.url}
                        alt={m.name || 'Image'}
                        style={{ width: '100%', display: 'block', borderRadius: 16, cursor: 'pointer' }}
                        onClick={() => window.open(m.url, '_blank')}
                      />
                    </div>
                  ))}

                  {/* Audio attachments */}
                  {media.filter(m => m.type === 'audio').map((m, mi) => (
                    <div key={mi} style={{
                      marginTop: 6,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 16,
                      padding: '10px 14px',
                      maxWidth: 280,
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                        &#127925; {m.name || 'Audio'}
                      </div>
                      <audio controls src={m.url} style={{ width: '100%', height: 32 }} />
                    </div>
                  ))}

                  {/* Timestamp */}
                  <span style={{
                    fontSize: 11, marginTop: 4,
                    color: 'var(--text-tertiary)',
                    opacity: 0,
                    textAlign: isUser ? 'right' : 'left',
                    paddingLeft: isUser ? 0 : 4,
                    paddingRight: isUser ? 4 : 0,
                    transition: 'opacity 200ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                  >
                    {timeStr(msg.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 16px 8px',
        flexShrink: 0,
        background: 'var(--material-regular)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        borderTop: '1px solid var(--separator)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {/* Attach button */}
          <label style={{ cursor: 'pointer', color: 'var(--text-tertiary)', padding: 8, flexShrink: 0, fontSize: 18 }} title="Attach image" aria-label="Attach file">
            &#128206;
            <input
              type="file"
              accept="image/*,audio/*"
              style={{ display: 'none' }}
              onChange={handleFileAttach}
            />
          </label>

          {/* Text input */}
          <div style={{ flex: 1 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agent.name}...`}
              rows={1}
              disabled={isStreaming}
              style={{
                width: '100%',
                minHeight: 40,
                maxHeight: 120,
                borderRadius: 22,
                background: 'var(--fill-tertiary)',
                border: 'none',
                color: 'var(--text-primary)',
                padding: '10px 16px',
                fontSize: 15,
                resize: 'none',
                outline: 'none',
                transition: 'box-shadow 200ms ease',
                opacity: isStreaming ? 0.5 : 1,
              }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 120) + 'px'
              }}
              onFocus={e => { e.target.style.boxShadow = '0 0 0 4px rgba(10,132,255,0.25)' }}
              onBlur={e => { e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Send button */}
          <div style={{
            flexShrink: 0,
            marginBottom: 2,
            opacity: hasInput ? 1 : 0,
            transform: hasInput ? 'scale(1)' : 'scale(0.6)',
            pointerEvents: hasInput ? 'auto' : 'none',
            transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <button
              onClick={sendMessage}
              disabled={isStreaming || !hasInput}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--accent)', color: '#000',
                border: 'none', cursor: 'pointer',
                fontSize: 18, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 150ms ease',
              }}
              title="Send message"
              aria-label="Send message"
            >
              &#8593;
            </button>
          </div>
        </div>

        <p style={{ fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 2, color: 'var(--text-quaternary)' }}>
          Enter to send &middot; Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
