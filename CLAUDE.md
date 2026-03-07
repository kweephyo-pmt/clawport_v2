# ClawPort -- Developer Guide

## Quick Reference

```bash
npm run setup        # Auto-detect OpenClaw config, write .env.local
npm run dev          # Start dev server (Turbopack, port 3000)
npm test             # Run all 536 tests via Vitest (24 suites)
npx tsc --noEmit     # Type-check (expect 0 errors)
npx next build       # Production build
```

### CLI (global install)

> The npm package is `clawport-ui`. The CLI command is `clawport`. The separate `clawport` npm package is unrelated.

```bash
npm install -g clawport-ui
clawport setup       # Auto-detect config, write .env.local into package dir
clawport dev         # Start dev server
clawport start       # Build + start production server
clawport status      # Check gateway reachability + env config
clawport help        # Show usage
```

The CLI resolves its own package root via `import.meta.url`, so all commands work regardless of the user's current working directory. Entry point: `bin/clawport.mjs`.

## Project Overview

ClawPort is a Next.js 16 dashboard for managing OpenClaw AI agents. It provides an org chart (Org Map), direct agent chat with multimodal support, cron monitoring, a cost dashboard, an activity console with live log streaming, and memory browsing. All AI calls route through the OpenClaw gateway -- no separate API keys needed.

## Tech Stack

- Next.js 16.1.6 (App Router, Turbopack)
- React 19.2.3, TypeScript 5
- Tailwind CSS 4 with CSS custom properties for theming
- Vitest 4 with jsdom environment
- OpenAI SDK (routed to Claude via OpenClaw gateway at localhost:18789)
- React Flow (@xyflow/react) for org chart

## Environment Variables

```env
WORKSPACE_PATH       # Required -- path to .openclaw workspace (auto-detected)
OPENCLAW_BIN         # Required -- path to openclaw binary
OPENCLAW_GATEWAY_TOKEN  # Required -- gateway auth token
ELEVENLABS_API_KEY   # Optional -- voice indicators
```

Run `npm run setup` to auto-detect all required values from your local OpenClaw installation.

**Workspace detection order:** `~/.openclaw/agents/main/workspace` (current layout) → `~/.openclaw/workspace` (legacy). Falls back to manual prompt if neither exists.

**Global install:** When installed via `npm install -g clawport-ui`, `.env.local` may not be writable in the package directory. Setup falls back to `~/.config/clawport-ui/.env.local` (XDG-compliant). The CLI (`bin/clawport.mjs`) checks both locations when loading env vars.

### Dev Server

`next.config.mjs` sets `allowedDevOrigins: ["*"]` so the dev server works over Tailscale, LAN, or any non-localhost origin without cross-origin errors.

## Architecture

### Agent Registry Resolution

```
loadRegistry() checks:
  1. $WORKSPACE_PATH/clawport/agents.json  (user override)
  2. Auto-discovered from $WORKSPACE_PATH   (agents/ directory scan)
  3. Bundled lib/agents.json               (default example)
```

`lib/agents-registry.ts` exports `loadRegistry()`. `lib/agents.ts` calls it to build the full agent list (merging in SOUL.md content from the workspace).

**Auto-discovery** scans `$WORKSPACE_PATH/agents/` for subdirectories containing a `SOUL.md` file. Each becomes an agent entry with sensible defaults (color from rotating palette, name from SOUL.md heading or directory slug). If `$WORKSPACE_PATH/SOUL.md` exists, it becomes the root orchestrator. This means any OpenClaw workspace works out of the box -- no `agents.json` needed.

Users can still drop a `clawport/agents.json` into their workspace for full control over names, colors, hierarchy, and tools.

### operatorName Flow

```
OnboardingWizard / Settings page
  -> ClawPortSettings.operatorName (localStorage)
  -> settings-provider.tsx (React context)
  -> NavLinks.tsx (dynamic initials + display name)
  -> ConversationView.tsx (sends operatorName in POST body)
  -> /api/chat/[id] route (injects into system prompt: "You are speaking with {operatorName}")
```

No hardcoded operator names anywhere. Falls back to "Operator" / "??" when unset.

### Chat Pipeline (Text)

```
Client -> POST /api/chat/[id] -> OpenAI SDK -> localhost:18789/v1/chat/completions -> Claude
                                             (streaming SSE response)
```

### Chat Pipeline (Images/Vision)

The gateway's HTTP endpoint strips image_url content. Vision uses the CLI agent pipeline:

```
Client resizes image to 1200px max (Canvas API)
  -> base64 data URL in message
  -> POST /api/chat/[id]
  -> Detects image in LATEST user message only (not history)
  -> execFile: openclaw gateway call chat.send --params <json> --token <token>
  -> Polls: openclaw gateway call chat.history every 2s
  -> Matches response by timestamp >= sendTs
  -> Returns assistant text via SSE
```

Key files: `lib/anthropic.ts` (send + poll logic), `app/api/chat/[id]/route.ts` (routing)

**Why send-then-poll?** `chat.send` is async -- it returns `{runId, status: "started"}` immediately. The `--expect-final` flag doesn't block for this method. We poll `chat.history` until the assistant's response appears.

**Why CLI and not WebSocket?** The gateway WebSocket requires device keypair signing for `operator.write` scope (needed by `chat.send`). The CLI has the device keys; custom clients don't.

**Why resize to 1200px?** macOS ARG_MAX is 1MB. Unresized photos can produce multi-MB base64 that exceeds CLI argument limits (E2BIG error). 1200px JPEG at 0.85 quality keeps base64 well under 1MB.

### Voice Message Pipeline

```
Browser MediaRecorder (webm/opus or mp4)
  -> AudioContext AnalyserNode captures waveform (40-60 samples)
  -> Stop -> audioBlob + waveform data
  -> POST /api/transcribe (Whisper via gateway)
  -> Transcription text sent as message content
  -> Audio data URL + waveform stored in message for playback
```

Key files: `lib/audio-recorder.ts`, `lib/transcribe.ts`, `components/chat/VoiceMessage.tsx`

### Conversation Persistence

Messages stored in localStorage as JSON. Media attachments are base64 data URLs (not blob URLs -- those don't survive reload). The `conversations.ts` module provides `addMessage()`, `updateLastMessage()`, and `parseMedia()`. Messages have three roles: `user`, `assistant`, and `system` (slash command results). System messages are never sent to the API -- they're filtered out before building the request.

### Slash Commands

Client-side slash commands in the chat input, handled entirely in the browser (never sent to the gateway):

```
User types "/" -> matchCommands() shows autocomplete dropdown
  -> Arrow keys navigate, Enter/Tab selects, Escape dismisses
  -> parseSlashCommand() validates input
  -> executeCommand() returns content string + optional action
  -> System message rendered as accent-bordered card
```

| Command | Description |
|---------|-------------|
| `/clear` | Clear conversation history |
| `/help` | Show available commands |
| `/info` | Show agent profile summary (name, title, tools, memory) |
| `/soul` | Show agent's SOUL.md persona document |
| `/tools` | List agent's available tools |
| `/crons` | Show agent's scheduled cron jobs |

**Key files:** `lib/slash-commands.ts` (command registry, parser, matcher, executor), `lib/slash-commands.test.ts` (35 tests)

**System message rendering:** System messages skip avatar/timestamp/spacing logic -- `shouldShowAvatar` and `shouldShowTimestamp` look through system messages to the previous non-system message for grouping. Media parsing is also skipped for system messages.

### Cost Dashboard

The Cost Dashboard (`app/costs/page.tsx`) provides token usage and cost analysis derived from cron run data:

```
GET /api/costs
  -> getCronRuns() (lib/cron-runs.ts) reads run history from workspace
  -> computeCostSummary() (lib/costs.ts) transforms runs into:
     - Per-run costs (model pricing lookup)
     - Per-job aggregation (total + median cost)
     - Daily cost timeline
     - Model breakdown (token distribution)
     - Anomaly detection (runs >5x median tokens)
     - Week-over-week comparison
     - Cache savings estimation
```

**Key files:** `lib/costs.ts` (all computation, 21 tests), `components/costs/CostsPage.tsx` (UI with daily bar chart, job table, model breakdown, anomaly alerts)

**Pricing:** Built-in table for Claude model variants (Opus, Sonnet, Haiku). Falls back to Sonnet pricing for unknown models. Prefix matching handles versioned model IDs.

### Activity Console & Live Stream

The Activity page (`app/activity/page.tsx`) shows a log browser for historical cron and config events. Live streaming is handled by a global floating widget:

```
"Open Live Stream" button (Activity page)
  -> dispatches CustomEvent('clawport:open-stream-widget')
  -> LiveStreamWidget (components/LiveStreamWidget.tsx) listens, opens expanded
  -> fetch('/api/logs/stream') -> SSE stream -> parseSSEBuffer() (lib/sse.ts)
  -> Lines rendered with level pills (INF/WRN/ERR/DBG), click to expand raw JSON
```

The widget is mounted in `app/layout.tsx` (global, survives navigation). Three visual states: hidden (default), collapsed pill, expanded panel. Collapsing does NOT stop the stream. Close stops + hides.

**Key files:** `components/LiveStreamWidget.tsx` (widget), `lib/sse.ts` (SSE parser), `app/api/logs/stream/route.ts` (SSE endpoint spawning `openclaw logs --follow --json`)

### Theming

Five themes defined via CSS custom properties in `app/globals.css`:
- Dark (default), Glass, Color, Light, System
- Components use semantic tokens: `--bg`, `--text-primary`, `--accent`, `--separator`, etc.
- Theme state managed by `app/providers.tsx` ThemeProvider (localStorage)

## Onboarding

`components/OnboardingWizard.tsx` -- 5-step first-run setup wizard:

1. **Welcome** -- portal name, subtitle, operator name (with live sidebar preview)
2. **Theme** -- pick from available themes (applies live)
3. **Accent Color** -- color preset grid
4. **Voice Chat** -- microphone permission test (optional)
5. **Overview** -- feature summary (Agent Map, Chat, Kanban, Crons, Memory)

**First-run detection:** checks `localStorage('clawport-onboarded')`. If absent, wizard shows automatically.

**Mounting:** `OnboardingWizard` is rendered in `app/layout.tsx` (always present, self-hides when not needed).

**Re-run:** settings page has a button that renders `<OnboardingWizard forceOpen onClose={...} />`. When `forceOpen` is true, the wizard pre-populates from current settings and does not set `clawport-onboarded` on completion.

## Environment Safety

`lib/env.ts` exports `requireEnv(name)` -- throws a clear error with the missing variable name and a pointer to `.env.example`.

**Critical pattern:** call `requireEnv()` inside functions, never at module top level. This prevents imports from crashing during `next build` or test runs when env vars are not set.

Used by: `lib/memory.ts`, `lib/cron-runs.ts`, `lib/kanban/chat-store.ts`, `lib/crons.ts`

## File Map

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents` | GET | All agents from registry + SOUL.md |
| `/api/chat/[id]` | POST | Agent chat -- text (streaming) or vision (send+poll) |
| `/api/crons` | GET | Cron jobs via `openclaw cron list --json` |
| `/api/memory` | GET | Memory dashboard: files, config, status, stats |
| `/api/costs` | GET | Cost summary computed from cron run token usage |
| `/api/logs` | GET | Historical log entries (cron runs + config audit) |
| `/api/logs/stream` | GET | SSE stream of live logs via `openclaw logs --follow --json` |
| `/api/tts` | POST | Text-to-speech via OpenClaw |
| `/api/transcribe` | POST | Audio transcription via Whisper |

### Core Libraries

| File | Purpose |
|------|---------|
| `lib/agents.ts` | Agent list builder -- calls `loadRegistry()`, merges SOUL.md |
| `lib/agents-registry.ts` | `loadRegistry()` -- workspace override -> bundled fallback |
| `lib/agents.json` | Bundled default agent registry |
| `lib/anthropic.ts` | Vision pipeline: `hasImageContent`, `extractImageAttachments`, `buildTextPrompt`, `sendViaOpenClaw` (send + poll), `execCli` |
| `lib/audio-recorder.ts` | `createAudioRecorder()` -- MediaRecorder + waveform via AnalyserNode |
| `lib/conversations.ts` | Conversation store with localStorage persistence |
| `lib/crons.ts` | Cron data fetching via CLI, dynamic agent matching by ID prefix |
| `lib/env.ts` | `requireEnv(name)` -- safe env var access with clear errors |
| `lib/multimodal.ts` | `buildApiContent()` -- converts Message+Media to OpenAI API format |
| `lib/settings.ts` | `ClawPortSettings` type, `loadSettings()`, `saveSettings()` (localStorage) |
| `lib/transcribe.ts` | `transcribe(audioBlob)` -- Whisper API with graceful fallback |
| `lib/memory.ts` | Memory dashboard: `getMemoryFiles()` (dynamic discovery), `getMemoryConfig()` (openclaw.json reader), `getMemoryStatus()` (CLI status), `computeMemoryStats()` (pure stats) |
| `lib/validation.ts` | `validateChatMessages()` -- validates text + multimodal content arrays |
| `lib/sse.ts` | `parseSSEBuffer()`, `parseSSELine()` -- client-safe SSE stream parser |
| `lib/logs.ts` | `getLogEntries()`, `computeLogSummary()` -- historical log parsing (cron + config) |
| `lib/costs.ts` | `getCostSummary()` -- cost analysis from cron run data |
| `lib/sanitize.ts` | `renderMarkdown()`, `colorizeJson()`, `escapeHtml()` -- safe HTML rendering |
| `lib/slash-commands.ts` | Slash command registry, parser (`parseSlashCommand`), matcher (`matchCommands`), executor (`executeCommand`) |
| `lib/id.ts` | `generateId()` -- UUID generator with fallback for non-secure contexts (HTTP, older browsers) |

### Chat Components

| Component | Purpose |
|-----------|---------|
| `ConversationView.tsx` | Main chat: messages, input, recording, paste/drop, file staging, slash commands. Sends `operatorName` in POST body. |
| `VoiceMessage.tsx` | Waveform playback: play/pause + animated bar visualization |
| `FileAttachment.tsx` | File bubble: icon by type + name + size + download |
| `MediaPreview.tsx` | Pre-send strip of staged attachments with remove buttons |
| `AgentList.tsx` | Desktop agent sidebar with unread badges |

### Other Components

| Component | Purpose |
|-----------|---------|
| `OnboardingWizard.tsx` | 5-step first-run setup wizard (name, theme, accent, mic, overview) |
| `NavLinks.tsx` | Sidebar nav with dynamic operator initials + name from settings |
| `Sidebar.tsx` | Sidebar layout shell |
| `AgentAvatar.tsx` | Agent emoji/image avatar with optional background |
| `DynamicFavicon.tsx` | Updates favicon based on portal emoji/icon settings |
| `LiveStreamWidget.tsx` | Global floating live log stream widget (hidden/collapsed/expanded) |

### Scripts & CLI

| File | Purpose |
|------|---------|
| `bin/clawport.mjs` | CLI entry point -- `clawport dev`, `clawport setup`, `clawport status`, etc. Resolves package root via `import.meta.url`. Loads `.env.local` from package dir or `~/.config/clawport-ui/` fallback via `getEnvLocalPath()` |
| `scripts/setup.mjs` | `npm run setup` / `clawport setup` -- auto-detects WORKSPACE_PATH (current + legacy paths), OPENCLAW_BIN, gateway token; writes `.env.local`. Falls back to `~/.config/clawport-ui/` if package dir is not writable. Accepts `--cwd=<path>` flag. Can auto-enable HTTP chat completions endpoint in `openclaw.json`. |

## Testing

24 test suites, 536 tests total. All in `lib/` directory.

```bash
npx vitest run                     # All tests
npx vitest run lib/anthropic.test.ts  # Single suite
npx vitest --watch                  # Watch mode
```

Key test patterns:
- `vi.mock('child_process')` for CLI tests (anthropic.ts)
- `vi.useFakeTimers({ shouldAdvanceTime: true })` for polling tests
- `vi.stubEnv()` for environment variable tests
- jsdom environment for DOM-dependent tests

## Conventions

- No external charting/media libraries -- native Web APIs (Canvas, MediaRecorder, AudioContext)
- Base64 data URLs for all persisted media (not blob URLs)
- CSS custom properties for theming -- no Tailwind color classes directly
- Inline styles referencing CSS vars (e.g., `style={{ color: 'var(--text-primary)' }}`)
- Tests colocated with source: `lib/foo.ts` + `lib/foo.test.ts`
- Agent chat uses `claude-sonnet-4-6` model via OpenClaw gateway
- No em dashes in agent responses (enforced via system prompt)
- Call `requireEnv()` inside functions, not at module top level
- No hardcoded operator names -- use `operatorName` from settings context

## Common Tasks

### Add a new agent
Edit `lib/agents.json` (or drop a custom `agents.json` into `$WORKSPACE_PATH/clawport/`). Auto-appears in map, chat, and detail pages.

### Customize agents for your workspace
Create `$WORKSPACE_PATH/clawport/agents.json` with your own agent entries. ClawPort loads this instead of the bundled default. Format matches `lib/agents.json`.

### Re-run onboarding wizard
Go to Settings page and click "Re-run Setup Wizard". This opens the wizard with `forceOpen` so it pre-populates current values and does not reset the `clawport-onboarded` flag.

### Add a new setting field
1. Add the field to `ClawPortSettings` interface in `lib/settings.ts`
2. Add a default value in `DEFAULTS`
3. Add parsing logic in `loadSettings()`
4. Add a setter method in `app/settings-provider.tsx`
5. Consume via `useSettings()` hook in components

### Add a new slash command
1. Add the command to `COMMANDS` array in `lib/slash-commands.ts`
2. Add a `case` in `executeCommand()` switch statement
3. Add tests in `lib/slash-commands.test.ts`
4. The autocomplete dropdown picks up new commands automatically

### Change the chat model
Edit `app/api/chat/[id]/route.ts` -- change the `model` field in `openai.chat.completions.create()`.

### Add a new theme
Add a `[data-theme="name"]` block in `app/globals.css` with all CSS custom properties. Add the theme ID to `lib/themes.ts`.

### Debug image pipeline
1. Check server console for `sendViaOpenClaw execFile error:` or `sendViaOpenClaw: timed out`
2. Test CLI directly: `openclaw gateway call chat.send --params '{"sessionKey":"agent:main:clawport","idempotencyKey":"test","message":"describe","attachments":[]}' --token <token> --json`
3. Check history: `openclaw gateway call chat.history --params '{"sessionKey":"agent:main:clawport"}' --token <token> --json`
4. Verify gateway is running: `openclaw gateway call health --token <token>`
