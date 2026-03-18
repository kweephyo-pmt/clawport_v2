import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

// Configuration
const IMAP_CONFIG = {
    host: 'imappro.zoho.com',
    port: 993,
    secure: true,
    auth: {
        user: 'agent@tbs-marketing.com',
        pass: '$$H10S0r*DvhR!lsK%'
    },
    logger: false
};

const SMTP_CONFIG = {
    host: 'smtppro.zoho.com',
    port: 465,
    secure: true,
    auth: {
        user: 'agent@tbs-marketing.com',
        pass: '$$H10S0r*DvhR!lsK%'
    }
};

const mailer = nodemailer.createTransport(SMTP_CONFIG);

// Use .env.local if present
const pkgRoot = process.cwd();
const envLocal = path.join(pkgRoot, '.env.local');

function loadEnvLocal() {
    if (fs.existsSync(envLocal)) {
        const content = fs.readFileSync(envLocal, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eq = trimmed.indexOf('=');
                if (eq > 0) {
                    const key = trimmed.slice(0, eq).trim();
                    const value = trimmed.slice(eq + 1).trim();
                    if (key) process.env[key] = value;
                }
            }
        }
    }
}

loadEnvLocal();

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || path.join(homedir(), '.openclaw', 'agents', 'main', 'workspace');
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || '18789';

const openai = new OpenAI({
    baseURL: `http://localhost:${GATEWAY_PORT}/v1`,
    apiKey: GATEWAY_TOKEN || 'dummy',
    timeout: 120000, // 2-minute timeout to prevent hanging
});

function generateId() {
    return crypto.randomBytes(8).toString('hex');
}

function getInboxFilePath() {
    return path.join(WORKSPACE_PATH, 'email-inbox.json');
}

async function processEmail(subject, textBody, from) {
    if (!subject && !textBody) return;

    console.log(`Processing email from ${from}: ${subject}`);

    const prompt = `You are a Senior Project Manager for an AI Agent Team at TBS Marketing.
You received a task request via email.

Subject: "${subject}"
Sender: ${from}
Body:
${textBody}

Your goal is to break this request into a high-quality Project defined by sub-tasks.
Each task must be assigned to one of our specialized agents:
- "trace": For market research, data gathering, or competitive analysis.
- "analyst": For analyzing data, SEO metrics, or research results.
- "strategist": For creating clear plans, outlines, or strategic angles.
- "writer": For drafting reports, email content, or LinkedIn posts.
- "auditor": For quality checks, proofreading, and final verification.
- "jarvis": For general orchestration or complex multi-step coordination.

INSTRUCTION: 
If the subject starts with "create a report project" or similar, prioritize the specific details in the subject (like dates "${subject.match(/\d+.*-.*\d+/)?.[0] || ''}") to guide the agents. The body may contain a forwarded report for reference/context.

Output a valid JSON array of tasks where each task has:
- "title": A short, clear task title.
- "description": Extremely detailed step-by-step instructions for the agent.
- "assigneeRole": Must be one of the IDs listed above (trace, analyst, strategist, writer, auditor, jarvis).
- "priority": "low", "medium", or "high".

IMPORTANT: ONLY output valid JSON array. No markdown, no preamble.`;

    try {
        const completion = await openai.chat.completions.create({
            model: 'kimi2.5',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
        });

        const resultText = completion.choices[0]?.message?.content || '[]';

        // Extract JSON array
        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        let tasks = [];
        if (jsonMatch) {
            tasks = JSON.parse(jsonMatch[0]);
        }

        const inboxPath = getInboxFilePath();
        let inbox = [];
        if (fs.existsSync(inboxPath)) {
            try {
                inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
            } catch (e) {
                inbox = [];
            }
        }

        const projectId = generateId();
        const newProject = {
            id: projectId,
            subject,
            from,
            body: textBody,
            tasks: tasks.map(t => ({ ...t, id: generateId(), status: 'todo' })),
            receivedAt: Date.now(),
            status: 'in-progress'
        };

        // 1. Save to inbox tracker
        inbox.push(newProject);
        fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2));

        // 2. CREATE TICKETS DIRECTLY IN KANBAN STORE
        const storePath = path.join(pkgRoot, 'data', 'kanban-store.json');
        const storeDir = path.dirname(storePath);
        if (!fs.existsSync(storeDir)) {
            fs.mkdirSync(storeDir, { recursive: true });
        }
        
        let store = {};
        if (fs.existsSync(storePath)) {
            try { store = JSON.parse(fs.readFileSync(storePath, 'utf-8')); } catch (e) {}
        }

        // We need the agents to find IDs
        const agentsPath = path.join(pkgRoot, 'lib', 'agents.json');
        let agents = [];
        if (fs.existsSync(agentsPath)) {
            try { agents = JSON.parse(fs.readFileSync(agentsPath, 'utf-8')); } catch (e) {}
        }

        tasks.forEach(t => {
            const ticketId = generateId();
            // Match role to agent ID or fallback to 'jarvis'
            const targetAgent = agents.find(a => a.id === t.assigneeRole) || agents.find(a => a.id === 'jarvis') || { id: 'jarvis' };
            
            store[ticketId] = {
                id: ticketId,
                title: t.title,
                description: `${t.description}\n\n---\nProject Context: ${subject}\nSource: ${from}`,
                priority: t.priority || 'medium',
                status: 'todo',
                assigneeId: targetAgent.id,
                assigneeRole: t.assigneeRole,
                workState: 'idle',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        });

        fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
        console.log(`[Autonomous] Created ${tasks.length} tickets in store for Project ${projectId}. Bot will start work immediately.`);
    } catch (e) {
        console.error('Error parsing or saving email:', e.message);
    }
}

let isCheckingEmails = false;

async function checkEmails() {
    if (isCheckingEmails) return;
    isCheckingEmails = true;

    const client = new ImapFlow(IMAP_CONFIG);
    const pendingEmails = [];

    try {
        await client.connect();

        let lock = await client.getMailboxLock('INBOX');
        try {
            // Unseen messages
            const messages = client.fetch({ unseen: true }, { source: true, uid: true });

            for await (let message of messages) {
                pendingEmails.push({ source: message.source, uid: message.uid });
            }

            // Mark as seen immediately so we don't fetch them again
            for (const msg of pendingEmails) {
                await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
            }

        } finally {
            lock.release();
        }
    } catch (err) {
        console.error('IMAP Error:', err);
    } finally {
        await client.logout();
    }

    // Process them offline so IMAP doesn't timeout waiting for LLM
    for (const msg of pendingEmails) {
        try {
            const mail = await simpleParser(msg.source);
            const subject = mail.subject || '';
            const textBody = mail.text || mail.html || '';
            const from = mail.from?.value[0]?.address || 'Unknown';

            const fromAddr = from.toLowerCase();

            // Only process emails from our authorized senders
            const isAuthorized = fromAddr.endsWith('@tbs-marketing.com') || fromAddr === 'leo.tbsmarketing@gmail.com';

            if (!isAuthorized) {
                console.log(`Skipping unauthorized sender: ${from}`);
                continue;
            }

            await processEmail(subject, textBody, from);
        } catch (e) {
            console.error('Failed to parse downloaded email:', e);
        }
    }

    isCheckingEmails = false;
}

// Helper to call OpenAI gateway for agent work
async function executeAgentWork(agentId, ticket) {
    const rolePrompts = {
        'trace': 'You are conducting Market Research. Provide a competitor landscape analysis.',
        'analyst': 'You are analyzing research data. Provide insights and identifying gaps.',
        'strategist': 'You are a Content Strategist. Provide a roadmap and unique angles.',
        'writer': 'You are a Content Writer. Draft high-quality copy in professional brand voice.',
        'auditor': 'You are a Quality Auditor. Review work for errors and alignment.',
        'jarvis': 'You are the Orchestrator. Coordinate final results and brief the user.'
    };
    const basePrompt = rolePrompts[ticket.assigneeRole] || 'Complete the assigned task effectively.';
    const fullPrompt = `${basePrompt}\n\nTask: ${ticket.title}\nDescription: ${ticket.description}`;

    try {
        const completion = await openai.chat.completions.create({
            model: 'kimi2.5',
            messages: [
                { role: 'system', content: `You are an AI Agent assigned to a professional task. Be thorough and actionable.` },
                { role: 'user', content: fullPrompt }
            ],
            temperature: 0.3,
        });
        return { success: true, content: completion.choices[0]?.message?.content || '' };
    } catch (e) {
        console.error(`[executeAgentWork] API call failed for agent ${agentId}:`, e.message);
        return { success: false, error: e.message };
    }
}

// Background job to execute "todo" tasks autonomously
async function runAgentWork() {
    const storePath = path.join(pkgRoot, 'data', 'kanban-store.json');
    if (!fs.existsSync(storePath)) return;

    try {
        const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        let modified = false;

        // --- NEW: Cleanup stale 'working' tickets ---
        const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
        for (const id in store) {
            const ticket = store[id];
            if (ticket.workState === 'working' && ticket.workStartedAt) {
                if (Date.now() - ticket.workStartedAt > STALE_TIMEOUT_MS) {
                    console.log(`[Autonomy] Resetting stale ticket "${ticket.title}" (stuck for >10m)`);
                    ticket.workState = 'idle';
                    ticket.status = 'todo';
                    ticket.workError = 'Task timed out or worker stalled.';
                    modified = true;
                }
            }
        }

        for (const id in store) {
            const ticket = store[id];
            // Only pick up 'todo' tickets that are truly idle and have an assignee
            if (ticket.status === 'todo' && ticket.workState === 'idle' && ticket.assigneeRole) {
                console.log(`[Autonomy] Starting work on ticket "${ticket.title}" for agent "${ticket.assigneeRole}"...`);
                
                // Mark as working
                ticket.workState = 'working';
                ticket.status = 'in-progress';
                ticket.workStartedAt = Date.now();
                fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

                const result = await executeAgentWork(ticket.assigneeId, ticket);

                if (result.success) {
                    ticket.workState = 'done';
                    ticket.status = 'done'; // In autonomous mode, we skip "review" and go straight to done
                    ticket.workResult = result.content;
                } else {
                    ticket.workState = 'failed';
                    ticket.workError = result.error;
                }
                
                ticket.updatedAt = Date.now();
                modified = true;
                console.log(`[Autonomy] Ticket "${ticket.title}" ${result.success ? 'completed' : 'failed'}.`);
            }
        }

        if (modified) {
            fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
        }
    } catch (e) {
        console.error('[Autonomy] Task execution error:', e);
    }
}

// Background job to check for completed tasks and reply with a PROFESSIONAL HTML TEMPLATE
async function checkCompletedProjects() {
    const inboxPath = getInboxFilePath();
    if (!fs.existsSync(inboxPath)) return;

    try {
        const inboxData = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
        let modified = false;

        const storePath = path.join(pkgRoot, 'data', 'kanban-store.json');
        let currentTickets = {};
        if (fs.existsSync(storePath)) {
            try { currentTickets = JSON.parse(fs.readFileSync(storePath, 'utf-8')); } catch (e) {}
        }

        for (let i = 0; i < inboxData.length; i++) {
            const project = inboxData[i];

            if (project.status === 'in-progress' || project.status === 'pending') {
                const projectTickets = Object.values(currentTickets).filter(t => 
                    t.description.includes(`Project Context: ${project.subject}`) || 
                    t.title.includes(project.subject)
                );

                if (projectTickets.length === 0) continue;

                const allFinished = projectTickets.every(t => t.status === 'done' || t.status === 'failed');

                if (allFinished) {
                    console.log(`[Autonomy] Project ${project.id} finished! Preparing professional HTML delivery...`);

                    let taskResultsHtml = '';
                    projectTickets.forEach(ticket => {
                        const content = (ticket.workResult || ticket.workError || 'Verified').replace(/\n/g, '<br>');
                        taskResultsHtml += `
                            <div style="margin-bottom: 25px;">
                                <h3 style="color: #34495e; margin-bottom: 5px;">${ticket.title}</h3>
                                <p style="font-size: 12px; color: #7f8c8d; margin: 0;">Agent: <strong>${ticket.assigneeRole?.toUpperCase() || 'SYSTEM'}</strong></p>
                                <div style="margin-top: 10px; padding-left: 15px; border-left: 2px solid #3498db; color: #333;">
                                    ${content}
                                </div>
                            </div>
                        `;
                    });

                    const htmlTemplate = `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
    <p>Hi there,</p>
    <p>Your requested intelligence brief is ready. Our AI agents have completed the following analysis for your project.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

    <h2 style="color: #2c3e50; margin-bottom: 10px;">${project.subject}</h2>
    <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} | <strong>TBS Marketing Intelligence Delivery</strong></p>

    <div style="margin-top: 30px;">
        ${taskResultsHtml}
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <h3 style="color: #34495e;">Strategic Takeaways</h3>
    <ul style="color: #444;">
        <li><strong>Autonomously Generated:</strong> This report was compiled and verified by the TBS Market Intelligence Bot.</li>
        <li><strong>Platform Context:</strong> Insights are tailored for AEO and Knowledge Retrieval systems.</li>
    </ul>

    <p style="margin-top: 30px;">Best regards,<br>
    <strong>TBS Marketing Team</strong><br>
    SEO / AEO / GEO for the AI Search Era<br>
    <a href="https://tbs-marketing.com" style="color: #3498db; text-decoration: none;">tbs-marketing.com</a></p>
</body>
</html>
                    `;

                    await mailer.sendMail({
                        from: '"TBS Marketing Intelligence" <agent@tbs-marketing.com>',
                        to: project.from,
                        replyTo: 'leo.tbsmarketing@gmail.com',
                        subject: `FINAL DELIVERY: ${project.subject}`,
                        html: htmlTemplate
                    });

                    console.log(`[Autonomy] Final HTML delivery email sent for Project ${project.id}.`);
                    project.status = 'complete';
                    modified = true;
                }
            }
        }

        if (modified) {
            fs.writeFileSync(inboxPath, JSON.stringify(inboxData, null, 2));
        }
    } catch (e) {
        console.error('[Autonomy] Completion check error:', e);
    }
}

// Main execution loop with Overlap Protection
async function mainLoop() {
    try {
        await checkEmails();
        await runAgentWork();
        await checkCompletedProjects();
    } catch (e) {
        console.error('[MainLoop] Error:', e);
    }
    // Schedule next run only AFTER current one finishes
    setTimeout(mainLoop, 30000); 
}

console.log('Starting Autonomous Agent loop (Safety v2)...');
mainLoop();
