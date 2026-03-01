# OneClaw Self-Improvement Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        OneClaw (clawd)                          │
│                  Self-Improving AI Agent                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Tool Registry                              │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐     │
│  │ discover │  audit   │  gmail   │ enrich   │  NEW:    │     │
│  │-business │-website  │  send    │-contact  │  SELF-   │     │
│  │          │          │          │          │  IMPROVE │     │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Self-Improvement Tools Layer                       │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │  execute-code   │  │   write-file    │  │   read-file    │ │
│  │                 │  │                 │  │                │ │
│  │ • TypeScript    │  │ • Create files  │  │ • Read files   │ │
│  │ • JavaScript    │  │ • Modify code   │  │ • Load config  │ │
│  │ • Bash          │  │ • Safe paths    │  │ • Validation   │ │
│  │ • VM2 sandbox   │  │ • Size limits   │  │ • Max size     │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                     │
│  │    database     │  │  init-database  │                     │
│  │                 │  │                 │                     │
│  │ • SQLite ops    │  │ • Create schema │                     │
│  │ • CRUD actions  │  │ • 6 tables      │                     │
│  │ • Query data    │  │ • Migrations    │                     │
│  │ • Transactions  │  │ • Indexes       │                     │
│  └─────────────────┘  └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Security Layer                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │             Path Validator                             │   │
│  │                                                        │   │
│  │  Allowlist: /oneclaw-workspace/*                      │   │
│  │  Blocklist: /etc/, /.env, /secrets/, /core/           │   │
│  │                                                        │   │
│  │  • Path traversal prevention                          │   │
│  │  • Pattern matching (.env*, *.key, *.pem)            │   │
│  │  • Operation-specific rules (read/write/delete)       │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │           Code Execution Sandbox                       │   │
│  │                                                        │   │
│  │  Blocked Operations:                                  │   │
│  │  • process.exit(), process.kill()                     │   │
│  │  • eval(), Function()                                 │   │
│  │  • require("child_process"), require("fs")            │   │
│  │  • Crypto private key ops                             │   │
│  │  • Dangerous bash (rm -rf /, mkfs, dd)               │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Database Security                         │   │
│  │                                                        │   │
│  │  Blocked SQL:                                         │   │
│  │  • DROP DATABASE                                      │   │
│  │  • ATTACH/DETACH DATABASE                             │   │
│  │  • DELETE without WHERE clause                        │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Sandboxed Workspace                            │
│                                                                 │
│  /workspace/packages/harness/oneclaw-workspace/                │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  code/   │  │  data/   │  │  logs/   │  │  tools/  │      │
│  │          │  │          │  │          │  │          │      │
│  │ • .ts    │  │ • .db    │  │ • .log   │  │ Custom   │      │
│  │ • .js    │  │ SQLite   │  │ Output   │  │ tools    │      │
│  │ • .sh    │  │ files    │  │ records  │  │ proto    │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Autonomous Database (SQLite)                       │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │   businesses    │  │   campaigns     │  │   outreach     │ │
│  │                 │  │                 │  │                │ │
│  │ • name          │  │ • name          │  │ • business_id  │ │
│  │ • website       │  │ • target_niche  │  │ • campaign_id  │ │
│  │ • phone/email   │  │ • emails_sent   │  │ • sent_date    │ │
│  │ • niche/city    │  │ • emails_reply  │  │ • opened       │ │
│  │ • audit_data    │  │ • status        │  │ • replied      │ │
│  │ • status        │  │                 │  │ • followup     │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │    contacts     │  │ autonomous_jobs │  │ knowledge_base │ │
│  │                 │  │                 │  │                │ │
│  │ • business_id   │  │ • job_type      │  │ • topic        │ │
│  │ • first/last    │  │ • schedule      │  │ • key          │ │
│  │ • email/phone   │  │ • next_run      │  │ • value (JSON) │ │
│  │ • linkedin_url  │  │ • last_status   │  │ • confidence   │ │
│  │ • verified      │  │ • enabled       │  │ • source       │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Example Campaign

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Discovery                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
         User: "Find 100 HVAC businesses in Austin, TX"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ discover-businesses tool → Apify                                │
│ Returns: 100 businesses with Google data                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Store in Database                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
         AI uses database tool → INSERT into businesses
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SQLite: businesses table                                        │
│ • 100 rows inserted                                            │
│ • status: 'discovered'                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Audit Websites                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
         Query businesses WHERE status = 'discovered'
         For each: audit-website tool
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SQLite: UPDATE businesses                                       │
│ • audit_data: JSON blob                                        │
│ • audit_score: 0-100                                           │
│ • status: 'audited'                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Enrich Contacts                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
         Query businesses WHERE status = 'audited'
         For each: enrich-contact tool
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SQLite: INSERT into contacts                                    │
│ • owner name, email, phone                                     │
│ • LinkedIn profile                                             │
│ • verified: true/false                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Create Campaign                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
         AI writes email template using execute-code
         Stores template in knowledge_base
         Creates campaign record
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SQLite: INSERT into campaigns                                   │
│ • name: "HVAC SEO Outreach - Austin"                           │
│ • target_niche: "hvac"                                         │
│ • status: 'active'                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Send Emails                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
         Query contacts with businesses.status = 'audited'
         For each: send-gmail tool
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SQLite: INSERT into outreach                                    │
│ • business_id, campaign_id                                     │
│ • gmail_message_id                                             │
│ • sent_date: NOW                                               │
│ • next_followup_date: NOW + 3 days                             │
│ • status: 'sent'                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 7: Track & Learn                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
         Monitor replies → UPDATE outreach
         Calculate open rates → UPDATE campaigns
         Store successful patterns → INSERT knowledge_base
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SQLite: knowledge_base                                          │
│ • topic: 'email_templates'                                     │
│ • key: 'hvac_austin_subject_line'                              │
│ • value: {"subject": "...", "openRate": 0.45}                  │
│ • confidence: 0.9                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Self-Improvement Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                    Continuous Learning                          │
└─────────────────────────────────────────────────────────────────┘

    1. Execute Task
         │
         ▼
    2. Track Performance
         │
         ▼
    3. Identify Patterns
         │
         ▼
    4. Store in knowledge_base
         │
         ▼
    5. Query knowledge_base for next task
         │
         ▼
    6. Apply learned optimizations
         │
         └─────► Better performance ────┐
                                         │
                 ┌───────────────────────┘
                 │
                 ▼
         [Continuous improvement]
```

## Progressive Tool Onboarding

```
┌─────────────────────────────────────────────────────────────────┐
│ User: "Send Slack notifications for new leads"                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: "I need Slack integration"                                 │
│     Research Slack API → write-file tool                       │
│     Generate spec → execute-code tool (test)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: "Here's the working implementation:"                       │
│     [Provides tested TypeScript code]                          │
│     [Provides OAuth setup instructions]                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Developer: Reviews & deploys                                    │
│     Adds to tool registry                                      │
│     Configures OAuth                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: "Thanks! Now I can send Slack notifications"               │
│     Uses new tool immediately                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                         SAFE ZONE                               │
│                   (AI has full access)                          │
│                                                                 │
│  /workspace/packages/harness/oneclaw-workspace/                │
│  ├── code/       ✅ Read, Write, Execute                       │
│  ├── data/       ✅ Create, Query, Update databases            │
│  ├── logs/       ✅ Write logs                                 │
│  └── tools/      ✅ Prototype new tools                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       FORBIDDEN ZONE                            │
│                   (AI cannot access)                            │
│                                                                 │
│  /etc/           ❌ System configuration                       │
│  /usr/           ❌ System binaries                            │
│  /var/           ❌ System state                               │
│  /home/          ❌ User directories                           │
│  /.env           ❌ Environment secrets                        │
│  /daemon/secrets ❌ Credential vault                           │
│  /daemon/src/core ❌ Daemon core code                          │
│  node_modules/   ❌ Dependencies                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│ Language: TypeScript                                            │
│ Runtime: Node.js 18+                                           │
│ Database: better-sqlite3 (SQLite)                              │
│ Sandbox: VM2 (JavaScript isolation)                            │
│ Schema: Zod (runtime validation)                               │
│ Package Manager: pnpm                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Files Created

```
packages/harness/
├── src/
│   ├── security/
│   │   ├── path-validator.ts     [Security layer]
│   │   └── index.ts
│   ├── tools/
│   │   ├── execute-code.ts       [Code execution]
│   │   ├── write-file.ts         [File creation]
│   │   ├── read-file.ts          [File reading]
│   │   ├── database.ts           [SQLite ops]
│   │   ├── init-database.ts      [Schema setup]
│   │   ├── test-self-improvement.ts [Test suite]
│   │   └── README.md             [Tool docs]
│   └── database/
│       └── autonomous-schema.sql [DB schema]
└── oneclaw-workspace/            [Sandboxed workspace]
    ├── code/
    ├── data/
    ├── logs/
    └── tools/
```

---

**Result**: A secure, autonomous AI agent platform with persistent memory, 
self-modification capabilities, and progressive learning abilities. 🚀
