'use client'

import type { KanbanTicket, TeamRole } from './types'
import { generateId } from '../id'

/* ── Role-specific work prompts ──────────────────────── */

const ROLE_PROMPTS: Record<TeamRole, string> = {
  'lead-dev': `You are working this ticket as the Lead Dev in the engineering team. Provide:
1. Technical breakdown of the work needed.
2. Implementation plan with clear steps.
3. Key technical decisions or trade-offs.
4. Dependencies or blockers to flag.`,

  'ux-ui': `You are working this ticket as the UX/UI Lead. Provide:
1. Design review and recommendations.
2. User flow walkthrough.
3. Visual/interaction suggestions focused on premium feel.`,

  'qa': `You are working this ticket as QA. Provide:
1. Test scenarios (happy path + edge cases).
2. Acceptance criteria checklist.
3. Potential regression areas.`,

  'trace': `You are working this ticket as TRACE (Market Research Agent). Provide:
1. Competitive landscape analysis for the requested period.
2. Top 3 competitor updates or news.
3. Pricing or feature benchmarks found in recent data.`,

  'analyst': `You are working this ticket as ANALYST (SEO & Data Analyst). Provide:
1. Data-driven insights from the provided research.
2. Strategic keyword or market-gap identifying.
3. Performance metrics interpretation.`,

  'strategist': `You are working this ticket as STRATEGIST. Provide:
1. A clear campaign or content strategy outline.
2. Unique selling angles based on current market trends.
3. Step-by-step roadmap for the creative team.`,

  'writer': `You are working this ticket as WRITER. Provide:
1. High-quality draft content (Email, Post, or Report) in the brand voice.
2. Engaging hooks and call-to-actions.
3. Structured layout ready for publication.`,

  'auditor': `You are working this ticket as AUDITOR (Quality Assurance). Provide:
1. Proofreading and brand-alignment check.
2. Verification of all facts/dates against original request.
3. Final approval or specific correction notes.`,

  'jarvis': `You are working this ticket as JARVIS (Orchestrator). Provide:
1. Coordination plan for the rest of the team.
2. Summary of current project status.
3. Executive briefing for the stakeholders.`,
}

const FALLBACK_PROMPT = `You are working this ticket. Provide:
1. Analysis of what needs to be done
2. Recommended approach
3. Key considerations or risks
4. Next steps

Be concise and actionable.`

export function getWorkPrompt(ticket: KanbanTicket): string {
  const rolePrompt = ticket.assigneeRole
    ? ROLE_PROMPTS[ticket.assigneeRole] ?? FALLBACK_PROMPT
    : FALLBACK_PROMPT

  return `${rolePrompt}

Ticket: ${ticket.title}
${ticket.description ? `Description: ${ticket.description}` : 'No description provided.'}
Priority: ${ticket.priority}`
}

/* ── Execute work via chat API ───────────────────────── */

interface WorkResult {
  success: boolean
  content: string
  error?: string
}

const WORK_TIMEOUT_MS = 500_000 // 5 minutes

export async function executeWork(
  agentId: string,
  ticket: KanbanTicket,
  onChunk?: (chunk: string) => void,
  externalSignal?: AbortSignal,
): Promise<WorkResult> {
  const prompt = getWorkPrompt(ticket)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WORK_TIMEOUT_MS)

    // Forward external abort (e.g. component unmount) to our controller
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId)
        return { success: false, content: '', error: 'Cancelled' }
      }
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    const res = await fetch(`/api/kanban/chat/${agentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'kimi2.5', // Fallback model for API route
        messages: [{ role: 'user', content: prompt }],
        ticket: {
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          assigneeRole: ticket.assigneeRole,
          workResult: ticket.workResult,
        },
      }),
    })

    if (!res.ok || !res.body) {
      clearTimeout(timeoutId)
      return { success: false, content: '', error: `API error: ${res.status}` }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    try {
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
              if (chunk.error) {
                return { success: false, content: fullContent, error: `Stream error: ${chunk.error}` }
              }
              if (chunk.content) {
                fullContent += chunk.content
                onChunk?.(chunk.content)
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }

    if (!fullContent) {
      return { success: false, content: '', error: 'Empty response from agent' }
    }

    return { success: true, content: fullContent }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, content: '', error: 'Agent work timed out' }
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, content: '', error: message }
  }
}

/* ── Persist work chat to filesystem via API ─────────── */

export function persistWorkChat(
  ticketId: string,
  prompt: string,
  response: string,
): void {
  const now = Date.now()
  const messages = [
    { id: generateId(), role: 'user' as const, content: prompt, timestamp: now },
    { id: generateId(), role: 'assistant' as const, content: response, timestamp: now + 1 },
  ]

  fetch(`/api/kanban/chat-history/${ticketId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  }).catch(() => { /* persist best-effort */ })
}
