// Discord Bot Service
// Gateway connection for real-time message handling
// This runs as a separate process or alongside the API

import { formatAuditForChat } from '../workflows/audit';
import { formatDiscoveryForChat, formatDiscoveryAsEmbed } from '../workflows/discovery';
import {
  shouldStartOnboarding,
  handleSetupMessage,
  getOnboardingState,
  ONBOARDING_MESSAGES,
  needsToolSetup,
  handleToolSetupPrompt,
} from './discord-onboarding';
import { generateAIResponse } from './ai';
import {
  getStores,
  isStoresInitialized,
  WORKFLOW_PRICES,
  calculatePrice,
  formatPrice,
  runner,
} from '@oneclaw/harness';
import { resolveUserForOneClaw } from '../stores/identity';

interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Store recent discovery results per user (in-memory, temporary)
const userDiscoveryResults = new Map<string, {
  businesses: any[];
  niche: string;
  location: string;
  offset: number;
  total: number;
}>();

// Discord Gateway Opcodes
const OPCODES = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
  };
  content: string;
  mentions: Array<{ id: string; username: string }>;
}

// =============================================================================
// INTENT PARSING
// =============================================================================

interface ParsedIntent {
  type: 'audit' | 'discovery' | 'status' | 'help' | 'chat' | 'unknown';
  params: Record<string, string>;
  confidence: number;
}

/**
 * Parse user intent from message using AI
 * Falls back to pattern matching if AI unavailable
 */
async function parseIntent(content: string): Promise<ParsedIntent> {
  const lowerContent = content.toLowerCase();

  // Try AI-based intent parsing first
  try {
    const systemPrompt = `You are an intent parser for a business automation bot. Parse the user message and respond with JSON only.

Available intents:
- audit: User wants to audit/analyze a website (extract URL)
- discovery: User wants to find businesses (extract niche and location)
- status: User wants to check their account/credits
- help: User needs help or instructions
- chat: User wants to have a conversation, ask a question, or say something casual (greetings, thanks, general questions)

IMPORTANT: Use "chat" for any conversational message, greeting, question, or casual talk. Only use specific intents when user clearly wants that action.

Respond with ONLY valid JSON in this format:
{"type": "audit|discovery|status|help|chat", "params": {"url": "...", "niche": "...", "location": "..."}, "confidence": 0.0-1.0}`;

    const response = await generateAIResponse(systemPrompt, {
      messages: [],
      currentMessage: content,
    });

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedIntent;
      if (parsed.type && parsed.confidence >= 0.7) {
        return parsed;
      }
    }
  } catch (error) {
    console.log('[discord-bot] AI intent parsing unavailable, using pattern matching');
  }

  // Fallback: Pattern matching
  // Audit pattern
  if (lowerContent.includes('audit') || lowerContent.startsWith('check ') || lowerContent.includes('analyze')) {
    const urlMatch = content.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    if (urlMatch) {
      return { type: 'audit', params: { url: urlMatch[0] }, confidence: 0.9 };
    }
    return { type: 'audit', params: {}, confidence: 0.5 };
  }

  // Discovery pattern
  if (lowerContent.includes('find') || lowerContent.includes('discover') || lowerContent.includes('search for')) {
    const patterns = [
      /(?:find|discover|search for)\s+(.+?)\s+(?:in|near|around)\s+(.+)/i,
      /(.+?)\s+(?:businesses?|companies?|leads?)\s+(?:in|near|around)\s+(.+)/i
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const [, niche, location] = match;
        return { type: 'discovery', params: { niche: niche.trim(), location: location.trim() }, confidence: 0.9 };
      }
    }
    return { type: 'discovery', params: {}, confidence: 0.5 };
  }

  // Help
  if (lowerContent === 'help' || lowerContent === '?') {
    return { type: 'help', params: {}, confidence: 1.0 };
  }

  // Status
  if (lowerContent === 'status' || lowerContent.includes('credits') || lowerContent.includes('balance')) {
    return { type: 'status', params: {}, confidence: 0.9 };
  }

  // Default to chat for any conversational message
  return { type: 'chat', params: {}, confidence: 0.8 };
}

// =============================================================================
// DISCORD BOT
// =============================================================================

/**
 * Discord Bot Gateway Client
 * Connects to Discord via WebSocket for real-time events
 */
export class DiscordBot {
  private ws: WebSocket | null = null;
  private heartbeatInterval: number = 0;
  private heartbeatTimer: NodeJS.Timer | null = null;
  private sessionId: string | null = null;
  private sequenceNumber: number | null = null;
  private botId: string | null = null;

  constructor(
    private token: string
  ) {}

  /**
   * Connect to Discord Gateway
   */
  async connect(): Promise<void> {
    console.log('[discord-bot] Connecting to Discord Gateway...');
    
    // Get gateway URL
    const gatewayResponse = await fetch('https://discord.com/api/v10/gateway/bot', {
      headers: { 'Authorization': `Bot ${this.token}` }
    });
    
    if (!gatewayResponse.ok) {
      throw new Error(`Failed to get gateway URL: ${gatewayResponse.status}`);
    }
    
    const { url } = await gatewayResponse.json();
    
    // Connect to gateway
    this.ws = new WebSocket(`${url}?v=10&encoding=json`);
    
    this.ws.onopen = () => {
      console.log('[discord-bot] WebSocket connected');
    };
    
    this.ws.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data.toString()));
    };
    
    this.ws.onclose = (event) => {
      console.log(`[discord-bot] WebSocket closed: ${event.code} - ${event.reason}`);
      this.cleanup();
      
      // Reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    };
    
    this.ws.onerror = (error) => {
      console.error('[discord-bot] WebSocket error:', error);
    };
  }

  /**
   * Handle incoming gateway messages
   */
  private handleMessage(data: { op: number; d: any; s?: number; t?: string }): void {
    const { op, d, s, t } = data;
    
    // Update sequence number
    if (s) this.sequenceNumber = s;
    
    switch (op) {
      case OPCODES.HELLO:
        // Start heartbeat
        this.heartbeatInterval = d.heartbeat_interval;
        this.startHeartbeat();
        
        // Send identify
        this.identify();
        break;
        
      case OPCODES.HEARTBEAT_ACK:
        // Heartbeat acknowledged
        break;
        
      case OPCODES.DISPATCH:
        this.handleDispatch(t!, d);
        break;
        
      case OPCODES.RECONNECT:
        console.log('[discord-bot] Received reconnect request');
        this.ws?.close();
        break;
        
      case OPCODES.INVALID_SESSION:
        console.log('[discord-bot] Invalid session, reconnecting...');
        setTimeout(() => this.identify(), 5000);
        break;
    }
  }

  /**
   * Handle dispatch events
   */
  private async handleDispatch(event: string, data: any): Promise<void> {
    switch (event) {
      case 'READY':
        console.log('[discord-bot] Connected as', data.user.username);
        this.sessionId = data.session_id;
        this.botId = data.user.id;
        break;
        
      case 'MESSAGE_CREATE':
        await this.handleMessageCreate(data);
        break;
      
      case 'INTERACTION_CREATE':
        await this.handleInteraction(data);
        break;
        
      // Add more event handlers as needed
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleMessageCreate(message: DiscordMessage): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if bot was mentioned or message is in DM
    const isMentioned = message.mentions.some(m => m.id === this.botId);
    const isDM = !message.guild_id;
    
    // Check if message is in a dedicated OneClaw channel (bot responds to all messages)
    const dedicatedChannels = (process.env.DISCORD_BOT_CHANNELS || '').split(',').filter(Boolean);
    const isInDedicatedChannel = dedicatedChannels.includes(message.channel_id);
    
    // Only respond if: mentioned, DM, or in dedicated channel
    if (!isMentioned && !isDM && !isInDedicatedChannel) return;
    
    // Extract content (remove mention if present)
    const content = message.content.replace(/<@!?\d+>/g, '').trim();
    
    console.log(`[discord-bot] Message from ${message.author.username}: ${content}`);
    
    // Check if this should trigger onboarding
    if (shouldStartOnboarding(content)) {
      const onboardingResponse = handleSetupMessage(
        message.author.id, 
        message.channel_id, 
        message.guild_id
      );
      await this.sendMessageWithComponents(message.channel_id, onboardingResponse);
      return;
    }
    
    // Check if user is in onboarding flow
    const onboardingState = getOnboardingState(message.author.id);
    if (onboardingState && onboardingState.step !== 'ready') {
      // Handle onboarding-related messages
      await this.handleOnboardingMessage(message, onboardingState, content);
      return;
    }
    
    // Process regular message
    const response = await this.processMessage(content, message.author.id, message.author.username);
    
    // Send response (detect if it's an embed object or plain text)
    if (typeof response === 'object' && 'embeds' in response) {
      await this.sendMessageWithComponents(message.channel_id, response);
    } else {
      await this.sendMessage(message.channel_id, response as string);
    }
  }

  /**
   * Handle button/select interactions
   */
  private async handleInteraction(interaction: any): Promise<void> {
    console.log('[discord-bot] Interaction received:', interaction.data?.custom_id);
    
    // Acknowledge the interaction immediately
    try {
      await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: '⏳ Processing...',
            flags: 64, // EPHEMERAL (only visible to user)
          },
        }),
      });
    } catch (error) {
      console.error('[discord-bot] Failed to acknowledge interaction:', error);
      return;
    }

    const customId = interaction.data?.custom_id || '';
    
    // Handle different button types
    if (customId.startsWith('discovery_export_')) {
      await this.handleExportButton(interaction);
    } else if (customId.startsWith('discovery_more_')) {
      await this.handleMoreButton(interaction);
    } else {
      // Unknown button
      await this.editInteractionResponse(interaction, '❌ This button is not yet implemented.');
    }
  }

  /**
   * Handle "Export CSV" button
   */
  private async handleExportButton(interaction: any): Promise<void> {
    await this.editInteractionResponse(
      interaction,
      '📥 CSV export is coming soon! For now, use the "Full List" link to view all results.'
    );
  }

  /**
   * Handle "Show More" button
   */
  private async handleMoreButton(interaction: any): Promise<void> {
    await this.editInteractionResponse(
      interaction,
      '📋 Pagination is coming soon! For now, use the "Full List" link or type `more` to see additional results.'
    );
  }

  /**
   * Edit the response to an interaction (follow-up message)
   */
  private async editInteractionResponse(interaction: any, content: string): Promise<void> {
    try {
      await fetch(
        `https://discord.com/api/v10/webhooks/${this.botId}/${interaction.token}/messages/@original`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content }),
        }
      );
    } catch (error) {
      console.error('[discord-bot] Failed to edit interaction response:', error);
    }
  }

  /**
   * Handle messages during onboarding
   */
  private async handleOnboardingMessage(
    message: DiscordMessage, 
    _state: { step: string }, 
    content: string
  ): Promise<void> {
    // If user says something during onboarding, remind them to use buttons
    await this.sendMessageWithComponents(message.channel_id, {
      content: '👆 Please use the buttons above to continue setup, or type `cancel` to restart.',
    });
  }

  /**
   * Process user message and determine action
   */
  private async processMessage(content: string, discordUserId: string, discordUsername: string): Promise<string | { embeds: any[]; components?: any[] }> {
    // Quick check for simple commands
    const lowerContent = content.toLowerCase().trim();
    
    if (lowerContent === 'more') {
      // Check if user has stored results
      const stored = userDiscoveryResults.get(discordUserId);
      if (!stored) {
        return '❌ No previous discovery results found. Run a search first:\n`find [niche] in [location]`';
      }
      
      // Get next batch
      const nextOffset = stored.offset + 10;
      if (nextOffset >= stored.businesses.length) {
        return `📋 **No more results**\n\nYou've seen all ${stored.businesses.length} businesses from your last search.\n\nRun a new search: \`find [niche] in [location]\``;
      }
      
      // Update offset
      stored.offset = nextOffset;
      userDiscoveryResults.set(discordUserId, stored);
      
      // Format next 10 businesses with correct numbering
      const nextBatch = stored.businesses.slice(nextOffset, nextOffset + 10);
      const currentPage = Math.floor(nextOffset / 10) + 1;
      const totalPages = Math.ceil(stored.businesses.length / 10);
      
      const result = {
        businesses: nextBatch.map((b: any, idx: number) => ({
          ...b,
          _actualIndex: nextOffset + idx, // Store actual index for numbering
        })),
        total_found: stored.total,
        niche: stored.niche,
        location: stored.location,
        search_time_ms: 0,
        source: 'cached',
        list_url: 'https://oneclaw.chat',
        _pagination: { current: currentPage, total: totalPages },
      };
      
      return formatDiscoveryAsEmbed(result as any);
    }
    
    if (lowerContent === 'enrich' || lowerContent === 'analyze') {
      return '🔬 **Enrichment workflow**\n\nThis will analyze all discovered websites for:\n• SEO optimization\n• Running ads\n• Booking calendars\n• Chatbots\n• AI readability\n• Owner contact info\n\n💰 Cost: $5 for up to 50 businesses\n\n⚠️ **This feature is being implemented with Restate for durable execution.**\n\nComing soon!';
    }
    
    // 1. Parse intent using AI (falls back to pattern matching)
    const intent = await parseIntent(content);
    console.log(`[discord-bot] Parsed intent:`, intent);

    // 2. Handle non-workflow intents first
    if (intent.type === 'help') {
      return this.getHelpMessage();
    }

    // 3. Handle chat/conversation
    if (intent.type === 'chat' || intent.type === 'unknown') {
      return await this.handleChat(content, discordUserId);
    }

    // 3. Resolve user identity (creates wallet if new)
    let user: User;
    try {
      user = await resolveUserForOneClaw('discord', discordUserId, {
        providerName: discordUsername,
      });
      console.log(`[discord-bot] Resolved user: ${user.id}`);
    } catch (error) {
      console.error('[discord-bot] Failed to resolve user:', error);
      return '❌ Unable to identify your account. Please try again.';
    }

    // 4. Handle status request
    if (intent.type === 'status') {
      return await this.getStatus(user);
    }

    // 5. For workflow intents, check we have required params
    if (intent.type === 'audit') {
      if (!intent.params.url) {
        return '❌ Please provide a URL to audit. Example: "audit example.com"';
      }
      return await this.runWorkflowWithBilling(user, 'audit-website', { url: intent.params.url });
    }

    if (intent.type === 'discovery') {
      if (!intent.params.niche || !intent.params.location) {
        return '❌ Please specify what you\'re looking for and where. Example: "find HVAC businesses in Denver"';
      }
      return await this.runWorkflowWithBilling(user, 'discover-businesses', {
        niche: intent.params.niche,
        location: intent.params.location,
      });
    }

    return '❌ Something went wrong. Please try again.';
  }

  /**
   * Get user status from wallet
   */
  private async getStatus(user: User): Promise<string> {
    if (!isStoresInitialized()) {
      return '📊 **Your Status**\n• Status checking unavailable (stores not initialized)';
    }

    try {
      const stores = getStores();
      const wallet = await stores.wallet.getByUserId(user.id);
      const tierLabel = wallet.tier.charAt(0).toUpperCase() + wallet.tier.slice(1);
      
      return `📊 **Your Status**
• **User ID**: ${user.id.slice(0, 8)}...
• **Plan**: ${tierLabel}
• **Balance**: ${formatPrice(wallet.balanceCents)}
• **Lifetime Spent**: ${formatPrice(wallet.lifetimeSpentCents)}`;
    } catch (error) {
      console.error('[discord-bot] Failed to get wallet:', error);
      return '📊 **Your Status**\n• Unable to load wallet. You may need to add funds first.';
    }
  }

  /**
   * Run a workflow with billing checks via harness
   */
  private async runWorkflowWithBilling(
    user: User,
    workflowId: string,
    params: Record<string, unknown>
  ): Promise<string> {
    console.log(`[discord-bot] Running workflow: ${workflowId}`, params);

    // 1. Check if stores are initialized
    if (!isStoresInitialized()) {
      console.warn('[discord-bot] Stores not initialized, falling back to runner without billing');
      return await this.runWorkflowViaRunner(user.id, workflowId, params);
    }

    // 2. Get wallet and check balance
    const stores = getStores();
    let wallet;
    try {
      wallet = await stores.wallet.getByUserId(user.id);
    } catch (error) {
      // Wallet may not exist yet - that's ok, they just need to add funds
      const pricing = WORKFLOW_PRICES[workflowId];
      const cost = pricing ? formatPrice(pricing.basePriceCents) : 'some credits';
      return `❌ You need to add funds to run this workflow.\n\n💰 This ${workflowId} costs ${cost}.\n\nUse \`top-up\` to add credits.`;
    }

    // 3. Calculate price based on user's tier
    const priceCalc = calculatePrice(workflowId, 1, wallet.tier);
    
    // 4. Check if user can afford
    if (wallet.balanceCents < priceCalc.finalPriceCents) {
      return `❌ Insufficient balance.\n\n💰 This ${priceCalc.workflowName} costs ${priceCalc.finalPriceFormatted}.\n💳 Your balance: ${formatPrice(wallet.balanceCents)}\n\nUse \`top-up\` to add credits.`;
    }

    // 5. Charge wallet upfront
    const idempotencyKey = `discord_${user.id}_${workflowId}_${Date.now()}`;
    try {
      await stores.wallet.debit(
        user.id,
        priceCalc.finalPriceCents,
        idempotencyKey,
        workflowId,
        `${priceCalc.workflowName} via Discord`
      );
      console.log(`[discord-bot] Charged ${priceCalc.finalPriceFormatted} for ${workflowId}`);
    } catch (error) {
      console.error('[discord-bot] Failed to charge wallet:', error);
      return '❌ Payment failed. Please try again.';
    }

    // 6. Run workflow via harness runner
    try {
      const result = await this.runWorkflowViaRunner(user.id, workflowId, params);
      return result;
    } catch (error) {
      // Refund on failure
      console.log(`[discord-bot] Workflow failed, refunding ${priceCalc.finalPriceFormatted}`);
      try {
        await stores.wallet.credit(
          user.id,
          priceCalc.finalPriceCents,
          `${idempotencyKey}_refund`,
          'refund',
          workflowId,
          `Refund: ${workflowId} failed`
        );
      } catch (refundError) {
        console.error('[discord-bot] Failed to refund:', refundError);
      }
      throw error;
    }
  }

  /**
   * Run workflow via harness ExecutionRunner
   */
  private async runWorkflowViaRunner(
    userId: string,
    workflowId: string,
    params: Record<string, unknown>
  ): Promise<string> {
    try {
      const job = await runner.execute(workflowId, params, {
        tenantId: userId,
        tier: 'free', // Will be overridden by actual tier if stores available
      });

      if (job.status === 'failed') {
        return `❌ Error: ${job.error || 'Unknown error'}`;
      }

      // Format response based on workflow
      switch (workflowId) {
        case 'audit':
        case 'audit-website':
          return formatAuditForChat(job.output);
        case 'discover':
        case 'discovery':
        case 'discover-businesses':
          // Wrap harness output with params for formatting
          const discoveryOutput = {
            ...job.output,
            niche: params.niche || 'businesses',
            location: params.location || 'unknown',
            limited_to: params.limit || 50,
            list_url: `https://oneclaw.chat/lists/discovery-${job.id}`,
            source: 'harness-apify',
            // Convert camelCase to snake_case for formatter
            total_found: job.output.totalFound,
            search_time_ms: job.output.searchTimeMs,
            businesses: job.output.businesses?.map((b: any) => ({
              ...b,
              review_count: b.reviewCount,
              place_id: b.placeId,
            })) || [],
          };
          
          // Store results for pagination
          userDiscoveryResults.set(userId, {
            businesses: discoveryOutput.businesses,
            niche: discoveryOutput.niche,
            location: discoveryOutput.location,
            offset: 0,
            total: discoveryOutput.total_found,
          });
          
          // Return embed object instead of plain text
          return formatDiscoveryAsEmbed(discoveryOutput);
        default:
          return `✅ **${workflowId} Complete**\n\n${JSON.stringify(job.output, null, 2)}`;
      }
    } catch (error) {
      console.error('[discord-bot] Runner error:', error);
      return `❌ Error running ${workflowId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Run a workflow and send result to channel (for deferred responses)
   * Used by interaction handlers (buttons, etc.)
   */
  async runWorkflowAndRespond(
    channelId: string,
    discordUserId: string,
    discordUsername: string,
    workflow: string,
    params: Record<string, unknown>
  ): Promise<void> {
    try {
      const user = await resolveUserForOneClaw('discord', discordUserId, {
        providerName: discordUsername,
      });
      const response = await this.runWorkflowWithBilling(user, workflow, params);
      await this.sendMessage(channelId, response);
    } catch (error) {
      console.error('[discord-bot] Workflow error:', error);
      await this.sendMessage(channelId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle conversational chat
   */
  private async handleChat(userMessage: string, userId?: string): Promise<string> {

    // Fallback: Direct AI via OpenRouter
    try {
      console.log('[discord-bot] Using direct AI (OpenRouter)');
      const systemPrompt = `You are OneClaw, a friendly AI assistant for business automation. You help users with:
- Website audits (tell them to say "audit [url]")
- Lead discovery (tell them to say "find [business type] in [location]")
- Account status (tell them to say "status")

Keep responses brief and conversational. Be helpful and friendly. If they seem to want a specific service, guide them to use the right command.

Your personality: Professional but approachable, efficient, and genuinely helpful. You're a claw that grabs business opportunities!`;

      const response = await generateAIResponse(systemPrompt, {
        messages: [],
        currentMessage: userMessage,
      });

      return response;
    } catch (error) {
      console.error('[discord-bot] Chat error:', error);
      // Fallback to help if AI fails
      return `Hey there! 👋 I can help you with:\n\n• **Audits**: "audit example.com"\n• **Lead Discovery**: "find plumbers in Denver"\n• **Status**: "status"\n\nWhat would you like to do?`;
    }
  }

  /**
   * Get help message
   */
  private getHelpMessage(): string {
    return `🦞 **OneClaw - AI Agent Assistant**

**Available Commands:**

📊 **Website Audit**
Just say: \`audit example.com\` or \`check example.com\`

🔍 **Lead Discovery**  
Just say: \`find plumbers in Denver\` or \`search for HVAC in Austin\`

💳 **Account Status**
Just say: \`status\` or \`credits\`

🚀 **Deploy Your Own Bot**
Just say: \`deploy\`

**Examples:**
• "audit myclient.com"
• "find landscaping businesses in Phoenix"
• "search for dentists near Dallas, TX"

Questions? Reply with \`help\` anytime!`;
  }

  /**
   * Send message to a channel
   */
  private async sendMessage(channelId: string, content: string): Promise<void> {
    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });
      
      if (!response.ok) {
        console.error('[discord-bot] Failed to send message:', await response.text());
      }
    } catch (error) {
      console.error('[discord-bot] Error sending message:', error);
    }
  }

  /**
   * Send message with embeds and components (buttons, selects)
   */
  private async sendMessageWithComponents(
    channelId: string, 
    payload: { content?: string; embeds?: object[]; components?: object[] }
  ): Promise<void> {
    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.error('[discord-bot] Failed to send rich message:', await response.text());
      }
    } catch (error) {
      console.error('[discord-bot] Error sending rich message:', error);
    }
  }

  /**
   * Send identify payload
   */
  private identify(): void {
    this.ws?.send(JSON.stringify({
      op: OPCODES.IDENTIFY,
      d: {
        token: this.token,
        intents: 
          (1 << 0) |  // GUILDS
          (1 << 9) |  // GUILD_MESSAGES
          (1 << 12) | // DIRECT_MESSAGES
          (1 << 15),  // MESSAGE_CONTENT
        properties: {
          os: 'linux',
          browser: 'oneclaw',
          device: 'oneclaw'
        }
      }
    }));
  }

  /**
   * Start heartbeat loop
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.ws?.send(JSON.stringify({
        op: OPCODES.HEARTBEAT,
        d: this.sequenceNumber
      }));
    }, this.heartbeatInterval);
  }

  /**
   * Cleanup on disconnect
   */
  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    this.cleanup();
    this.ws?.close();
  }
}

/**
 * Start the Discord bot
 */
export async function startDiscordBot(): Promise<DiscordBot | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  
  if (!token) {
    console.warn('[discord-bot] DISCORD_BOT_TOKEN not set, bot not started');
    return null;
  }
  
  // Check if stores are initialized (warn but don't fail)
  if (!isStoresInitialized()) {
    console.warn('[discord-bot] Harness stores not initialized - billing will be unavailable');
  }
  
  const bot = new DiscordBot(token);
  await bot.connect();
  
  return bot;
}
