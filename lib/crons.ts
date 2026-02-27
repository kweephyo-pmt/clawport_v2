import { CronJob } from '@/lib/types'
import { execSync } from 'child_process'

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/Users/johnrice/.nvm/versions/node/v22.14.0/bin/openclaw'

const PREFIX_MAP: [string, string][] = [
  ['pulse-', 'pulse'],
  ['herald-', 'herald'],
  ['robin-', 'robin'],
  ['seo-team-', 'lumen'],
  ['seo-', 'lumen'],
  ['echo-', 'echo'],
  ['spark-', 'spark'],
  ['scribe-', 'scribe'],
  ['kaze-', 'kaze'],
  ['vault-', 'jarvis'],
  ['builder-', 'jarvis'],
  ['manor-', 'jarvis'],
  ['maven-', 'maven'],
  ['recon-', 'robin'],
  ['team-memory-', 'scribe'],
  ['mochi-', 'pulse'],
]

function matchAgent(name: string): string | null {
  for (const [prefix, agentId] of PREFIX_MAP) {
    if (name.startsWith(prefix)) return agentId
  }
  return null
}

export async function getCrons(): Promise<CronJob[]> {
  try {
    const raw = execSync(`${OPENCLAW_BIN} cron list --json`, {
      encoding: 'utf-8',
      timeout: 10000,
    })

    const parsed = JSON.parse(raw)
    const jobs: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed.jobs ?? parsed.data ?? []

    return jobs.map((job: unknown) => {
      const j = job as Record<string, unknown>
      const state = (j.state as Record<string, unknown>) || {}
      const name = String(j.name || '')
      const schedule = String(j.schedule || '')

      // Status can be in state.status or directly on j.status
      const rawStatus = state.status ?? j.status ?? ''
      let status: 'ok' | 'error' | 'idle' = 'idle'
      if (rawStatus === 'error' || rawStatus === 'failed') {
        status = 'error'
      } else if (rawStatus === 'ok' || rawStatus === 'success' || rawStatus === 'completed') {
        status = 'ok'
      }

      // nextRun: try state.nextRunAtMs first, then state.nextRunAt
      const nextRunMs = state.nextRunAtMs ?? state.nextRunAt ?? j.nextRunAtMs ?? j.nextRunAt
      const nextRun = nextRunMs
        ? new Date(Number(nextRunMs)).toISOString()
        : null

      // lastRun: try state.lastRunAtMs, state.lastRunAt, or top-level equivalents
      const lastRunRaw = state.lastRunAtMs ?? state.lastRunAt ?? j.lastRunAtMs ?? j.lastRunAt ?? j.last
      const lastRun = lastRunRaw
        ? (typeof lastRunRaw === 'number' ? new Date(lastRunRaw).toISOString() : String(lastRunRaw))
        : null

      const lastError = (state.lastError ?? state.error ?? j.lastError) ? String(state.lastError ?? state.error ?? j.lastError) : null

      return {
        id: String(j.id || j.name || ''),
        name,
        schedule,
        status,
        lastRun,
        nextRun,
        lastError,
        agentId: matchAgent(name),
      }
    })
  } catch (err) {
    throw new Error(
      `Failed to fetch cron jobs: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
