import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { gatewayBaseUrl, requireEnv } from '@/lib/env'
import fs from 'node:fs'
import path from 'node:path'
import { generateId } from '@/lib/id'

// Route through the OpenClaw gateway
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''
const openai = new OpenAI({
    baseURL: gatewayBaseUrl(),
    apiKey: GATEWAY_TOKEN || 'dummy',
})

// Ensures the inbox file exists
function getInboxFilePath() {
    const workspace = requireEnv('WORKSPACE_PATH')
    return path.join(workspace, 'email-inbox.json')
}

export async function POST(request: Request) {
    try {
        const payload = await request.json()

        // Support typical webhook formats (e.g. SendGrid, Postmark, Mailgun)
        const subject = payload.subject || payload.Subject || ''
        const textBody = payload.text || payload.TextBody || payload.body || ''
        const from = payload.from || payload.From || ''

        if (!subject && !textBody) {
            return NextResponse.json({ error: 'No subject or body found in email' }, { status: 400 })
        }

        // Agent prompt to break down the email into Kanban tasks
        const prompt = `You are the lead project manager. You received an email from ${from} with the subject: "${subject}"
    
Body:
${textBody}

Please break this down into actionable sub-tasks for a software development/agent team. 
Output a valid JSON array of tasks where each task has:
- "title": A short, clear task title
- "description": Detailed instructions
- "assigneeRole": Must be exactly one of: "lead-dev", "ux-ui", or "qa"
- "priority": Must be exactly one of: "low", "medium", or "high"

IMPORTANT: ONLY output valid JSON. Nothing else. No markdown wrapping. Just the JSON array.`

        const completion = await openai.chat.completions.create({
            model: 'claude-sonnet-4-6', // default openclaw model
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
        })

        const resultText = completion.choices[0]?.message?.content || '[]'

        // Extract JSON array
        const jsonMatch = resultText.match(/\[[\s\S]*\]/)
        let tasks = []
        if (jsonMatch) {
            tasks = JSON.parse(jsonMatch[0])
        }

        // Save to inbox
        const inboxPath = getInboxFilePath()
        let inbox = []
        if (fs.existsSync(inboxPath)) {
            try {
                inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'))
            } catch (e) {
                inbox = []
            }
        }

        const projectId = generateId()
        const newProject = {
            id: projectId,
            subject,
            from,
            body: textBody,
            tasks: tasks.map((t: any) => ({ ...t, id: generateId(), status: 'todo' })),
            receivedAt: Date.now(),
            status: 'pending' // pending -> in-progress -> complete
        }

        inbox.push(newProject)
        fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2))

        return NextResponse.json({ success: true, project: newProject })
    } catch (error) {
        console.error('Email webhook error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function GET() {
    try {
        const inboxPath = getInboxFilePath()
        if (!fs.existsSync(inboxPath)) {
            return NextResponse.json({ projects: [] })
        }
        const inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'))
        return NextResponse.json({ projects: inbox })
    } catch (error) {
        return NextResponse.json({ projects: [] })
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json()
        const { projectId, status } = body

        const inboxPath = getInboxFilePath()
        if (!fs.existsSync(inboxPath)) {
            return NextResponse.json({ error: 'Inbox not found' }, { status: 404 })
        }

        let inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'))
        inbox = inbox.map((p: any) => p.id === projectId ? { ...p, status } : p)
        fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2))

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
}
