import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';

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

    const prompt = `You are the lead project manager. You received an email from ${from} with the subject: "${subject}"
    
Body:
${textBody}

Please break this down into actionable sub-tasks for a software development/agent team. 
Output a valid JSON array of tasks where each task has:
- "title": A short, clear task title
- "description": Detailed instructions
- "assigneeRole": Must be exactly one of: "lead-dev", "ux-ui", or "qa"
- "priority": Must be exactly one of: "low", "medium", or "high"

IMPORTANT: ONLY output valid JSON. Nothing else. No markdown wrapping. Just the JSON array.`;

    try {
        const completion = await openai.chat.completions.create({
            model: 'claude-sonnet-4-6',
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

async function checkEmails() {
    const client = new ImapFlow(IMAP_CONFIG);

    try {
        await client.connect();

        let lock = await client.getMailboxLock('INBOX');
        try {
            // Unseen messages
            const messages = client.fetch({ unseen: true }, { source: true, uid: true });

            for await (let message of messages) {
                const mail = await simpleParser(message.source);
                const subject = mail.subject;
                const textBody = mail.text || mail.html || '';
                const from = mail.from?.value[0]?.address || 'Unknown';

                await processEmail(subject, textBody, from);

                // Mark as seen
                await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'], { uid: true });
            }

        } finally {
            lock.release();
        }
    } catch (err) {
        console.error('IMAP Error:', err);
    } finally {
        await client.logout();
    }
}

// Run immediately and then conditionally via setInterval loop
console.log('Starting IMAP listener loop...');
checkEmails();

// Poll every 60 seconds
setInterval(checkEmails, 60000);
