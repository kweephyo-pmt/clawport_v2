import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import fs from 'node:fs'
import path from 'node:path'
import { requireEnv } from '@/lib/env'

import { homedir } from 'node:os'

function getStoreFilePath() {
    // Both on Mac and VPS, we want to store it in ~/.openclaw/clawport-kanban/store.json
    return path.join(homedir(), '.openclaw', 'clawport-kanban', 'store.json');
}

function ensureDir() {
    const filePath = getStoreFilePath()
    const dirPath = path.dirname(filePath)
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
    }
}

export async function GET() {
    try {
        const storePath = getStoreFilePath()
        if (!fs.existsSync(storePath)) {
            return NextResponse.json({})
        }
        const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
        return NextResponse.json(store)
    } catch (error) {
        console.error('Failed to load kanban store:', error)
        return NextResponse.json({}, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const store = await request.json()
        ensureDir()
        const storePath = getStoreFilePath()
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to save kanban store:', error)
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }
}
