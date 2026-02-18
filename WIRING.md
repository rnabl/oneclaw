# iClaw Wiring Guide

This guide explains how to wire up all the components.

## Environment Variables to Configure

### 1. Discord Bot (Required for Discord channel)

1. Go to https://discord.com/developers/applications
2. Create new application named "iClaw"
3. Go to Bot section → Add Bot
4. Enable these intents:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
5. Copy the bot token and add to `.env.local`:

```env
DISCORD_APPLICATION_ID=your_app_id
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_PUBLIC_KEY=your_public_key
```

6. Generate OAuth2 invite URL with scopes: `bot`, `applications.commands`
7. Permissions needed: Send Messages, Read Messages, Embed Links
8. Invite bot to your server

### 2. Register Discord Slash Commands

After configuring Discord env vars, hit this endpoint:

```bash
curl http://localhost:3000/discord/register-commands
```

### 3. nabl Workflow API (Your existing nabl backend)

If you have a separate nabl service:

```env
NABL_AUDIT_URL=https://your-nabl.dev/api/audit
NABL_DISCOVERY_URL=https://your-nabl.dev/api/discovery
NABL_API_KEY=your-nabl-api-key
```

For testing, the mock data works without these.

### 4. Fly.io Provisioning (For user deployments)

```env
FLY_API_TOKEN=your_fly_api_token
```

Get token from: https://fly.io/user/personal_access_tokens

### 5. Stripe (Already configured)

Your Stripe keys are already in `.env.local`. The webhook will:
- Trigger provisioning when checkout completes
- Send confirmation via Sendblue

## Testing the System

### 1. Start the API

```bash
cd apps/api
pnpm dev
```

### 2. Test nabl Workflow API

```bash
# Audit
curl -X POST http://localhost:3000/api/v1/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "audit",
    "params": {"url": "example.com"},
    "iclaw_key": "iclaw-master-key-change-me"
  }'

# Discovery
curl -X POST http://localhost:3000/api/v1/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "discovery",
    "params": {"niche": "plumbers", "location": "Denver, CO"},
    "iclaw_key": "iclaw-master-key-change-me"
  }'

# List available workflows
curl http://localhost:3000/api/v1/workflows
```

### 3. Test Discord (after wiring)

- Add bot to your server
- Mention the bot: `@iClaw audit example.com`
- Or use slash commands: `/audit example.com`

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     iClaw API Server                        │
│                  (apps/api/src/index.ts)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Endpoints:                                                 │
│  ├─ POST /api/v1/workflow     → nabl Universal API         │
│  ├─ GET  /api/v1/workflows    → List available workflows   │
│  ├─ POST /discord/interactions→ Discord slash commands     │
│  ├─ GET  /discord/register    → Register slash commands    │
│  ├─ POST /webhook/stripe      → Stripe checkout events     │
│  └─ POST /webhook/sendblue    → iMessage webhooks          │
│                                                             │
│  Services:                                                  │
│  ├─ discord-bot.ts   → WebSocket bot (real-time messages)  │
│  └─ fly-provision.ts → User VM provisioning                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ All long-running tasks
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Handlers                        │
│               (apps/api/src/workflows/)                    │
├─────────────────────────────────────────────────────────────┤
│  audit.ts     → Website audits (can call external nabl)    │
│  discovery.ts → Lead discovery (can call external nabl)    │
└─────────────────────────────────────────────────────────────┘
```

## Framework Integration

Each framework (OpenClaw, ZeroClaw, LangGraph, CrewAI) has:
1. A Dockerfile in `infrastructure/docker/`
2. An integration template in `infrastructure/integrations/`

The integrations show how each framework calls the nabl Universal API.

## File Structure

```
iClaw/
├── apps/api/src/
│   ├── index.ts              # Main API entry point
│   ├── routes/
│   │   ├── nabl-workflow.ts  # POST /api/v1/workflow
│   │   ├── discord.ts        # Discord interactions
│   │   └── stripe.ts         # Stripe webhooks
│   ├── services/
│   │   ├── discord-bot.ts    # WebSocket bot
│   │   └── fly-provision.ts  # Fly.io Machine API
│   └── workflows/
│       ├── audit.ts          # Audit workflow handler
│       └── discovery.ts      # Discovery workflow handler
├── infrastructure/
│   ├── docker/               # Dockerfiles for each framework
│   └── integrations/         # Framework-specific integrations
│       ├── openclaw/         # OpenClaw nabl tool
│       ├── zeroclaw/         # ZeroClaw config with nabl
│       ├── langgraph/        # Python LangGraph agent
│       └── crewai/           # Python CrewAI agent
└── .env.local                # All environment variables
```

## Next Steps

1. **Configure Discord** - Add Discord bot credentials
2. **Test locally** - Run `pnpm dev` and test endpoints
3. **Connect nabl** - Point to your actual nabl backend
4. **Deploy** - Use existing DigitalOcean or deploy to Fly.io
5. **Invite users** - They DM the bot and go through onboarding
