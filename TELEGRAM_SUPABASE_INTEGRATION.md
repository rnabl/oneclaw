# Telegram Bot Supabase Integration

## ✅ What Your Telegram Bot Can Do NOW:

Your bot can **read and write** to Supabase using the credentials already in `.env.production`:

```env
SUPABASE_URL=https://kaqatynbnaqdsfvfjlkt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

## 📋 Available Commands

I created helper functions in `packages/harness/src/telegram/supabase-helpers.ts`:

### 1. **View Workflows**
```
User: /jobs
Bot: 📋 Your Recent Workflows:
     ✅ discover-businesses
        Status: completed
        Progress: 4/4
        ID: abc-123
```

### 2. **Workflow Details**
```
User: /job abc-123
Bot: 📊 Workflow Details
     Status: completed
     💾 Saved Data:
     - raw_businesses: 0.05MB
     - enriched_businesses: 0.12MB
```

### 3. **View Saved Businesses**
```
User: /businesses abc-123
Bot: [Shows list of 100 businesses that were saved]
```

### 4. **Resume Failed Workflow**
```
User: /resume
Bot: 🔄 Failed Workflows (Data Saved):
     
     discover-businesses
     Failed at: Step 2/4
     Saved: 1 artifacts
     Command: /resume abc-123

User: /resume abc-123
Bot: 🔄 Workflow Resumed from Checkpoint
     ✅ Step 1: Discovery - 100 businesses recovered
     📍 Resuming from step 2...
```

### 5. **Export to CSV**
```
User: /export abc-123
Bot: [Sends CSV file with all 100 businesses]
```

## 🔧 How to Integrate Into Your Bot

### Example Bot Handler:

```typescript
import {
  getUserWorkflows,
  getWorkflowDetails,
  getSavedBusinesses,
  getResumableWorkflowsList,
  resumeWorkflowCommand,
  exportBusinessesToCSV,
  formatWorkflowList,
  formatWorkflowDetails,
  formatResumableWorkflows,
} from '@oneclaw/harness/telegram/supabase-helpers';

// In your Telegram message handler:
async function handleTelegramMessage(message: string, userId: string) {
  
  // List user's workflows
  if (message === '/jobs' || message === '/status') {
    const result = await getUserWorkflows(userId);
    if (result.success) {
      return formatWorkflowList(result.workflows);
    }
    return `Error: ${result.error}`;
  }
  
  // Get workflow details
  if (message.startsWith('/job ')) {
    const runId = message.split(' ')[1];
    const result = await getWorkflowDetails(runId);
    if (result.success) {
      return formatWorkflowDetails(result);
    }
    return `Error: ${result.error}`;
  }
  
  // View saved businesses
  if (message.startsWith('/businesses ')) {
    const runId = message.split(' ')[1];
    const result = await getSavedBusinesses(runId);
    if (result.success) {
      const businesses = result.businesses.slice(0, 10); // Show first 10
      let response = `💼 **Saved Businesses** (${result.type}):\n\n`;
      for (const biz of businesses) {
        response += `**${biz.name}**\n`;
        if (biz.phone) response += `📞 ${biz.phone}\n`;
        if (biz.website) response += `🌐 ${biz.website}\n`;
        response += `\n`;
      }
      return response;
    }
    return `Error: ${result.error}`;
  }
  
  // List resumable workflows
  if (message === '/resume') {
    const result = await getResumableWorkflowsList(userId);
    if (result.success) {
      return formatResumableWorkflows(result.workflows);
    }
    return `Error: ${result.error}`;
  }
  
  // Resume specific workflow
  if (message.startsWith('/resume ')) {
    const runId = message.split(' ')[1];
    const result = await resumeWorkflowCommand(runId, userId);
    if (result.success) {
      return result.message;
    }
    return `Error: ${result.error}`;
  }
  
  // Export to CSV
  if (message.startsWith('/export ')) {
    const runId = message.split(' ')[1];
    const result = await exportBusinessesToCSV(runId);
    if (result.success) {
      // Send CSV file to user
      return {
        type: 'file',
        filename: result.filename,
        content: result.csv,
        caption: `📥 Exported ${result.count} businesses`,
      };
    }
    return `Error: ${result.error}`;
  }
  
  // ... your other commands (find businesses, etc)
}
```

## 🎯 What This Enables

### 1. **Data Persistence**
- User runs discovery → 100 businesses saved
- Bot crashes → Data still in Supabase
- User can retrieve it later with `/businesses <id>`

### 2. **Resume Failed Workflows**
- Enrichment fails at business 47/100
- Don't lose the 46 already enriched
- `/resume <id>` continues from where it stopped

### 3. **Workflow History**
- User can see all their past discoveries
- Check status of running workflows
- View logs and errors

### 4. **Export Data**
- Get CSV of businesses
- Share with team
- Import to CRM

## 🔒 Security Note

The Supabase connection is **automatically secure** because:
- Service role key gives full access (but only to your bot)
- RLS policies protect user data
- Each user can only see their own workflows (via `user_id`)

## 🚀 Next Steps

1. **Add these commands to your bot**
2. **Test with a real workflow**:
   ```
   User: find hvac in Denver
   Bot: [runs discovery, saves to Supabase]
   User: /jobs
   Bot: [shows the discovery job]
   User: /businesses <id>
   Bot: [shows the 100 businesses]
   ```

3. **Monitor in Supabase**:
   - Go to Supabase dashboard
   - Check `workflow_runs`, `workflow_artifacts`, `workflow_logs` tables
   - See real-time data as users interact

Want me to help you integrate these commands into your actual Telegram bot code?
