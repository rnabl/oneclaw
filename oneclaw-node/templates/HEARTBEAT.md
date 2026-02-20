# Heartbeat Checklist

## Purpose
This file runs periodically (every 30min by default) to keep the agent proactive without spamming.

## What to Check

- **Inbox scan**: Anything urgent that needs attention?
- **Follow-ups**: Any tasks blocked or waiting for user input?
- **Scheduled tasks**: Anything due today that hasn't been addressed?

## Response Rules

- If nothing needs attention: reply `HEARTBEAT_OK` (will be suppressed)
- If something urgent: describe it briefly (will be delivered to user)
- Keep responses short and actionable

## Notes

- This is just a template. Customize for your needs.
- The agent can update this file based on your workflow.
- Keep it small to avoid prompt bloat (heartbeats run frequently).
