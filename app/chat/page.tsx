'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Agent } from '@/lib/types'
import { AgentList } from '@/components/chat/AgentList'
import { ConversationView } from '@/components/chat/ConversationView'
import {
  loadConversations, saveConversations, getOrCreateConversation,
  markRead, type ConversationStore
} from '@/lib/conversations'

function MessengerApp() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [agents, setAgents] = useState<Agent[]>([])
  const [conversations, setConversations] = useState<ConversationStore>({})
  const [activeAgentId, setActiveAgentId] = useState<string | null>(searchParams.get('agent'))
  const [loading, setLoading] = useState(true)

  // Load agents
  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then((data: Agent[]) => {
      setAgents(data)
      setLoading(false)
    })
  }, [])

  // Load conversations from localStorage
  useEffect(() => {
    setConversations(loadConversations())
  }, [])

  // Save conversations whenever they change
  useEffect(() => {
    if (Object.keys(conversations).length > 0) {
      saveConversations(conversations)
    }
  }, [conversations])

  // Set default active agent
  useEffect(() => {
    if (!loading && agents.length > 0 && !activeAgentId) {
      setActiveAgentId(agents[0].id)
    }
  }, [loading, agents, activeAgentId])

  const handleSelectAgent = useCallback((agent: Agent) => {
    setActiveAgentId(agent.id)
    setConversations(prev => {
      const conv = getOrCreateConversation(prev, agent)
      const next = { ...prev, [agent.id]: conv }
      return markRead(next, agent.id)
    })
    router.replace(`/chat?agent=${agent.id}`, { scroll: false })
  }, [router])

  const handleConversationUpdate = useCallback((agentId: string, updater: (prev: ConversationStore) => ConversationStore) => {
    setConversations(prev => updater(prev))
  }, [])

  const activeAgent = agents.find(a => a.id === activeAgentId) || null

  // Init conversation for active agent
  useEffect(() => {
    if (activeAgent) {
      setConversations(prev => {
        const conv = getOrCreateConversation(prev, activeAgent)
        return markRead({ ...prev, [activeAgent.id]: conv }, activeAgent.id)
      })
    }
  }, [activeAgent?.id])

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      <AgentList
        agents={agents}
        conversations={conversations}
        activeId={activeAgentId}
        onSelect={handleSelectAgent}
        loading={loading}
      />

      {activeAgent && conversations[activeAgent.id] ? (
        <ConversationView
          key={activeAgent.id}
          agent={activeAgent}
          conversation={conversations[activeAgent.id]}
          onUpdate={handleConversationUpdate}
        />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          gap: 12,
        }}>
          <div style={{ fontSize: 48 }}>&#127984;</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Manor Messages</div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Select an agent to start chatting</div>
        </div>
      )}
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <MessengerApp />
    </Suspense>
  )
}
