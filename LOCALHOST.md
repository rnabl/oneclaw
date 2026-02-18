# Run OneClaw on localhost (API + Node)

Two terminals. No deploy.

## 1. API (Gmail OAuth + integrations)

From repo root:

```bash
pnpm install
pnpm --filter @oneclaw/api dev
```

Runs at **http://localhost:3000**.

For Gmail connect to work, the API needs Google OAuth env vars. In repo root or `apps/api/` create **`.env.local`** with:

```env
PORT=3000
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback
```

In [Google Cloud Console](https://console.cloud.google.com/) → your OAuth client → add **Authorized redirect URI**:  
`http://localhost:3000/oauth/google/callback`

## 2. Node (UI + Integrations tab)

From repo root:

```bash
cd oneclaw-node
cargo run -- daemon
```

Runs at **http://localhost:8787**.

Point the node at your local API: in **Config** (or `~/.oneclaw/config.yaml` / project `config.yaml`) set:

```yaml
control_plane:
  url: http://localhost:3000
```

Restart the node after changing config.

## 3. Test the flow

1. Open **http://localhost:8787/integrations.html**
2. If you see “Step 1: Add your Google keys”, paste Client ID + Secret (and Callback URL if needed) → **Save & continue**
3. Click **Connect Gmail** → **Let’s go** → sign in with Google in the popup
4. You should land back and see Gmail connected

If the API isn’t running or has no Google env, you’ll get the setup wizard or the “OAuth not configured” page until the API has the vars and is restarted.
