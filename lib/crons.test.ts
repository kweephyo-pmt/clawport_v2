// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}))

// Mock child_process (Dependency Inversion -- no real CLI calls)
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  default: { execSync: mockExecSync },
}))

import { getCrons } from './crons'

beforeEach(() => {
  vi.clearAllMocks()
})

// --- Well-formed data ---

describe('getCrons - well-formed data', () => {
  it('parses a flat array response', async () => {
    const mockData = [
      {
        id: 'cron-1',
        name: 'pulse-trending',
        schedule: '0 8 * * *',
        status: 'success',
        state: {
          nextRunAtMs: 1700000000000,
          lastRunAtMs: 1699900000000,
        },
      },
    ]
    mockExecSync.mockReturnValue(JSON.stringify(mockData))

    const crons = await getCrons()
    expect(crons).toHaveLength(1)
    expect(crons[0].id).toBe('cron-1')
    expect(crons[0].name).toBe('pulse-trending')
    expect(crons[0].schedule).toBe('0 8 * * *')
    expect(crons[0].status).toBe('ok')
    expect(crons[0].agentId).toBe('pulse')
    expect(crons[0].nextRun).toBeTruthy()
    expect(crons[0].lastRun).toBeTruthy()
    expect(crons[0].lastError).toBeNull()
  })

  it('parses a { jobs: [...] } wrapper', async () => {
    const mockData = {
      jobs: [
        {
          id: 'cron-2',
          name: 'seo-team-weekly',
          schedule: '0 9 * * 1',
          state: { status: 'ok' },
        },
      ],
    }
    mockExecSync.mockReturnValue(JSON.stringify(mockData))

    const crons = await getCrons()
    expect(crons).toHaveLength(1)
    expect(crons[0].name).toBe('seo-team-weekly')
    expect(crons[0].agentId).toBe('lumen')
  })

  it('parses a { data: [...] } wrapper', async () => {
    const mockData = {
      data: [
        {
          id: 'cron-3',
          name: 'echo-reddit-scan',
          schedule: '0 6 * * 0',
          state: { status: 'completed' },
        },
      ],
    }
    mockExecSync.mockReturnValue(JSON.stringify(mockData))

    const crons = await getCrons()
    expect(crons).toHaveLength(1)
    expect(crons[0].status).toBe('ok')
    expect(crons[0].agentId).toBe('echo')
  })

  it('maps multiple crons to correct agents', async () => {
    const mockData = [
      { id: '1', name: 'pulse-daily', schedule: '0 8 * * *', state: {} },
      { id: '2', name: 'herald-linkedin', schedule: '0 10 * * 1-5', state: {} },
      { id: '3', name: 'kaze-flights', schedule: '0 7 * * *', state: {} },
      { id: '4', name: 'spark-discover', schedule: '0 12 */2 * *', state: {} },
      { id: '5', name: 'scribe-compress', schedule: '0 0 * * 0', state: {} },
      { id: '6', name: 'robin-recon', schedule: '0 6 * * 1', state: {} },
      { id: '7', name: 'vault-backup', schedule: '0 3 * * *', state: {} },
      { id: '8', name: 'maven-calendar', schedule: '0 9 * * 1', state: {} },
      { id: '9', name: 'team-memory-sync', schedule: '0 23 * * *', state: {} },
      { id: '10', name: 'mochi-feed', schedule: '0 11 * * *', state: {} },
    ]
    mockExecSync.mockReturnValue(JSON.stringify(mockData))

    const crons = await getCrons()
    expect(crons).toHaveLength(10)

    const agentMap: Record<string, string | null> = {}
    for (const c of crons) agentMap[c.name] = c.agentId

    expect(agentMap['pulse-daily']).toBe('pulse')
    expect(agentMap['herald-linkedin']).toBe('herald')
    expect(agentMap['kaze-flights']).toBe('kaze')
    expect(agentMap['spark-discover']).toBe('spark')
    expect(agentMap['scribe-compress']).toBe('scribe')
    expect(agentMap['robin-recon']).toBe('robin')
    expect(agentMap['vault-backup']).toBe('jarvis')
    expect(agentMap['maven-calendar']).toBe('maven')
    expect(agentMap['team-memory-sync']).toBe('scribe')
    expect(agentMap['mochi-feed']).toBe('pulse')
  })
})

// --- Status mapping ---

describe('getCrons - status mapping', () => {
  function makeCronWithStatus(status: string) {
    return JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: { status },
    }])
  }

  it('maps "success" to "ok"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus('success'))
    const crons = await getCrons()
    expect(crons[0].status).toBe('ok')
  })

  it('maps "completed" to "ok"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus('completed'))
    const crons = await getCrons()
    expect(crons[0].status).toBe('ok')
  })

  it('maps "ok" to "ok"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus('ok'))
    const crons = await getCrons()
    expect(crons[0].status).toBe('ok')
  })

  it('maps "error" to "error"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus('error'))
    const crons = await getCrons()
    expect(crons[0].status).toBe('error')
  })

  it('maps "failed" to "error"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus('failed'))
    const crons = await getCrons()
    expect(crons[0].status).toBe('error')
  })

  it('maps unknown status to "idle"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus('pending'))
    const crons = await getCrons()
    expect(crons[0].status).toBe('idle')
  })

  it('maps empty string status to "idle"', async () => {
    mockExecSync.mockReturnValue(makeCronWithStatus(''))
    const crons = await getCrons()
    expect(crons[0].status).toBe('idle')
  })

  it('reads status from top-level when state.status is missing', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      status: 'error',
      state: {},
    }]))
    const crons = await getCrons()
    expect(crons[0].status).toBe('error')
  })
})

// --- Error / lastError ---

describe('getCrons - error and lastError', () => {
  it('captures lastError from state', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: { status: 'error', lastError: 'timeout after 10s' },
    }]))
    const crons = await getCrons()
    expect(crons[0].lastError).toBe('timeout after 10s')
  })

  it('captures error from state.error fallback', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: { error: 'network failure' },
    }]))
    const crons = await getCrons()
    expect(crons[0].lastError).toBe('network failure')
  })

  it('captures lastError from top-level', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: {},
      lastError: 'out of memory',
    }]))
    const crons = await getCrons()
    expect(crons[0].lastError).toBe('out of memory')
  })

  it('sets lastError to null when no error info present', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: {},
    }]))
    const crons = await getCrons()
    expect(crons[0].lastError).toBeNull()
  })
})

// --- Error propagation (current implementation throws) ---

describe('getCrons - error propagation', () => {
  it('throws when execSync throws (CLI not installed)', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('ENOENT') })
    await expect(getCrons()).rejects.toThrow('Failed to fetch cron jobs')
    await expect(getCrons()).rejects.toThrow('ENOENT')
  })

  it('throws for invalid JSON output', async () => {
    mockExecSync.mockReturnValue('not valid json {{')
    await expect(getCrons()).rejects.toThrow('Failed to fetch cron jobs')
  })
})

// --- Graceful defaults for missing fields ---

describe('getCrons - missing fields defaults', () => {
  it('handles job with all fields missing (defaults to safe values)', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{}]))
    const crons = await getCrons()
    expect(crons).toHaveLength(1)
    expect(crons[0].id).toBe('')
    expect(crons[0].name).toBe('')
    expect(crons[0].schedule).toBe('')
    expect(crons[0].status).toBe('idle')
    expect(crons[0].lastRun).toBeNull()
    expect(crons[0].nextRun).toBeNull()
    expect(crons[0].lastError).toBeNull()
    expect(crons[0].agentId).toBeNull()
  })

  it('handles job with no state object', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'x',
      name: 'pulse-test',
      schedule: '0 * * * *',
    }]))
    const crons = await getCrons()
    expect(crons).toHaveLength(1)
    expect(crons[0].status).toBe('idle')
  })

  it('uses j.name as id fallback when j.id is missing', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      name: 'herald-post',
      schedule: '0 10 * * *',
      state: {},
    }]))
    const crons = await getCrons()
    expect(crons[0].id).toBe('herald-post')
  })

  it('returns null agentId for unrecognized name prefix', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'unknown',
      name: 'mystery-cron',
      schedule: '0 0 * * *',
      state: {},
    }]))
    const crons = await getCrons()
    expect(crons[0].agentId).toBeNull()
  })

  it('handles empty array from CLI', async () => {
    mockExecSync.mockReturnValue(JSON.stringify([]))
    const crons = await getCrons()
    expect(crons).toEqual([])
  })

  it('handles empty object from CLI (no jobs/data key)', async () => {
    mockExecSync.mockReturnValue(JSON.stringify({}))
    const crons = await getCrons()
    expect(crons).toEqual([])
  })
})

// --- Date parsing ---

describe('getCrons - date parsing', () => {
  it('converts nextRunAtMs (milliseconds) to ISO string', async () => {
    const ts = 1700000000000
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: { nextRunAtMs: ts },
    }]))
    const crons = await getCrons()
    expect(crons[0].nextRun).toBe(new Date(ts).toISOString())
  })

  it('converts lastRunAtMs to ISO string', async () => {
    const ts = 1699900000000
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: { lastRunAtMs: ts },
    }]))
    const crons = await getCrons()
    expect(crons[0].lastRun).toBe(new Date(ts).toISOString())
  })

  it('falls back to top-level nextRunAt', async () => {
    const ts = 1700000000000
    mockExecSync.mockReturnValue(JSON.stringify([{
      id: 'test',
      name: 'pulse-test',
      schedule: '* * * * *',
      state: {},
      nextRunAt: ts,
    }]))
    const crons = await getCrons()
    expect(crons[0].nextRun).toBe(new Date(ts).toISOString())
  })
})
