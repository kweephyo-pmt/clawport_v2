import { Agent } from '@/lib/types'
import { readFileSync, existsSync } from 'fs'
import registryData from '@/lib/agents.json'

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/Users/johnrice/.openclaw/workspace'

/** Raw agent data from JSON (everything except runtime-loaded soul and crons) */
type AgentEntry = Omit<Agent, 'soul' | 'crons'>

const registry: AgentEntry[] = registryData as AgentEntry[]

export async function getAgents(): Promise<Agent[]> {
  return registry.map((entry) => {
    let soul: string | null = null
    if (entry.soulPath) {
      try {
        const fullPath = WORKSPACE_PATH + '/' + entry.soulPath
        if (existsSync(fullPath)) {
          soul = readFileSync(fullPath, 'utf-8')
        }
      } catch {
        soul = null
      }
    }
    return {
      ...entry,
      soul,
      crons: [],
    }
  })
}

export async function getAgent(id: string): Promise<Agent | null> {
  const agents = await getAgents()
  return agents.find((a) => a.id === id) ?? null
}
