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
            status: 'pending' // pending -> in-progress -> complete
        };

        inbox.push(newProject);
        fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2));

        console.log(`Saved new project ${projectId} with ${tasks.length} tasks.`);
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

// Run immediately and then conditionally via setInterval loop
console.log('Starting IMAP listener loop...');
checkEmails();

// Poll every 60 seconds
setInterval(checkEmails, 60000);

// Background job to check for completed tasks and reply
async function checkCompletedProjects() {
    const inboxPath = getInboxFilePath();
    if (!fs.existsSync(inboxPath)) return;

    try {
        const inboxData = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
        let modified = false;

        // Path should match app/api/kanban/route.ts
        const storePath = path.join(WORKSPACE_PATH, '..', '..', 'clawport-kanban', 'store.json');
        let currentTickets = {};
        if (fs.existsSync(storePath)) {
            currentTickets = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        }

        for (let i = 0; i < inboxData.length; i++) {
            const project = inboxData[i];

            // Only care about in-progress projects
            if (project.status === 'in-progress') {
                // Find all tickets belonging to this project in the store
                const projectTickets = Object.values(currentTickets).filter(t => 
                    t.description.includes(`Project Context: ${project.subject}`) || 
                    t.title.includes(project.subject)
                );

                if (projectTickets.length === 0) continue; // Not started yet

                const allFinished = projectTickets.every(t => t.status === 'done' || t.status === 'failed');

                if (allFinished) {
                    console.log(`Project ${project.id} ("${project.subject}") is fully completed! Preparing final delivery email to ${project.from}...`);

                    let detailedReport = `Hello,\n\nYour requested project "${project.subject}" has been successfully completed by the AI Agent Team.\n\n`;
                    detailedReport += `--------------------------------------------------\n`;
                    detailedReport += `EXECUTIVE SUMMARY OF WORK COMPLETED:\n`;
                    detailedReport += `--------------------------------------------------\n\n`;

                    projectTickets.forEach(ticket => {
                        detailedReport += `[Agent: ${ticket.assigneeId || 'System'}] - TASK: ${ticket.title}\n`;
                        if (ticket.workResult) {
                            detailedReport += `Outcome:\n${ticket.workResult}\n`;
                        } else if (ticket.workError) {
                            detailedReport += `Note: Encountered an issue: ${ticket.workError}\n`;
                        } else {
                            detailedReport += `Outcome: Successfully verified.\n`;
                        }
                        detailedReport += `\n`;
                    });

                    detailedReport += `--------------------------------------------------\n`;
                    detailedReport += `Best Regards,\nYour Autonomous Team @ TBS Marketing\n`;

                    // Send the final result email back!
                    await mailer.sendMail({
                        from: '"Clawport Bot at TBS" <agent@tbs-marketing.com>',
                        to: project.from,
                        subject: `FINAL DELIVERY: ${project.subject}`,
                        text: detailedReport
                    });

                    console.log(`Final delivery email sent to ${project.from} for Project ${project.id}.`);

                    // Mark project as totally complete in our tracking file
                    project.status = 'complete';
                    modified = true;
                }
            }
        }

        if (modified) {
            fs.writeFileSync(inboxPath, JSON.stringify(inboxData, null, 2));
        }

    } catch (e) {
        console.error('Autonomous check error:', e);
    }
}

// Check for completed projects every 60 seconds
setInterval(checkCompletedProjects, 60000);
