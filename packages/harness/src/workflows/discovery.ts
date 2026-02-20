/**
 * UNIVERSAL AGENT DISCOVERY WORKFLOW
 * 
 * This is the OpenClaw-style "agent loop" that:
 * 1. Takes a natural language goal
 * 2. Uses vision to see what's on screen
 * 3. Reasons about what to do next
 * 4. Takes action (click, type, scroll)
 * 5. Observes result
 * 6. Loops until goal achieved
 * 
 * NO HARDCODED SELECTORS. NO SITE-SPECIFIC LOGIC.
 * Just an LLM that can SEE and THINK like a human.
 */

import { chromium, Browser, Page } from 'playwright';
import { GeminiVision, VisionAnalysis } from '../utils/gemini-vision';

export interface AgentGoal {
  task: string;           // "Find golf tee times for 4 players on Feb 26"
  startUrl: string;       // "https://www.riverdalegolf.com/teetimes/"
  maxIterations?: number; // Default 10
  extractData?: boolean;  // If true, extract structured data at end
}

export interface AgentResult {
  success: boolean;
  iterations: number;
  actions: string[];
  data?: any;            // Extracted data if requested
  screenshots?: string[]; // Base64 screenshots for debugging
  error?: string;
}

export class DiscoveryAgent {
  private vision: GeminiVision;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private debug: boolean;

  constructor(apiKey: string, debug: boolean = true) {
    this.vision = new GeminiVision(apiKey);
    this.debug = debug;
  }

  private log(message: string) {
    if (this.debug) {
      console.log(`[Agent] ${message}`);
    }
  }

  /**
   * THE MAIN AGENT LOOP
   * This is what makes it work like OpenClaw
   */
  async execute(goal: AgentGoal): Promise<AgentResult> {
    const maxIterations = goal.maxIterations || 10;
    const actions: string[] = [];
    const screenshots: string[] = [];
    
    try {
      // Launch browser
      this.log('🚀 Launching browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      
      this.page = await context.newPage();

      // Navigate to start URL
      this.log(`📍 Navigating to: ${goal.startUrl}`);
      await this.page.goto(goal.startUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      // Wait for page to settle - be patient like a human
      this.log('⏳ Waiting for page to load...');
      await this.page.waitForTimeout(5000);
      actions.push(`Navigated to ${goal.startUrl}`);

      // THE LOOP
      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        this.log(`\n📸 Iteration ${iteration}/${maxIterations}`);
        
        // 1. SEE - Take screenshot (full page to see everything)
        const screenshot = await this.page.screenshot({ fullPage: true });
        screenshots.push(screenshot.toString('base64'));
        
        // 2. THINK - Ask LLM what to do
        this.log('🧠 Analyzing screenshot...');
        const analysis = await this.vision.analyzeAndDecide(
          screenshot,
          goal.task,
          actions,
          iteration
        );
        
        this.log(`   State: ${analysis.pageState}`);
        this.log(`   Sees: ${analysis.description}`);
        this.log(`   Action: ${analysis.suggestedAction.type} - ${analysis.suggestedAction.reasoning}`);
        this.log(`   Progress: ${analysis.goalProgress}%`);

        // 3. CHECK - Are we done?
        if (analysis.suggestedAction.type === 'done') {
          this.log('✅ Goal achieved!');
          
          // Extract data if requested
          let extractedData = null;
          if (goal.extractData) {
            this.log('📊 Extracting data...');
            const finalScreenshot = await this.page.screenshot({ fullPage: true });
            extractedData = await this.extractDataFromScreen(finalScreenshot, goal.task);
          }
          
          return {
            success: true,
            iterations: iteration,
            actions,
            data: extractedData,
            screenshots: this.debug ? screenshots : undefined,
          };
        }

        if (analysis.suggestedAction.type === 'fail') {
          this.log('❌ Agent determined goal cannot be achieved');
          return {
            success: false,
            iterations: iteration,
            actions,
            error: analysis.suggestedAction.reasoning,
            screenshots: this.debug ? screenshots : undefined,
          };
        }

        // 4. ACT - Execute the action
        const actionResult = await this.executeAction(analysis);
        actions.push(`${analysis.suggestedAction.type}: ${analysis.suggestedAction.target || analysis.suggestedAction.reasoning}`);
        
        // 5. OBSERVE - Wait for result
        if (analysis.suggestedAction.type !== 'wait') {
          await this.page.waitForTimeout(1500); // Let page react
        }
        
        // Check for any navigation
        try {
          await this.page.waitForLoadState('networkidle', { timeout: 3000 });
        } catch {
          // Timeout is fine, page might not navigate
        }
      }

      // Ran out of iterations
      this.log('⚠️ Max iterations reached');
      return {
        success: false,
        iterations: maxIterations,
        actions,
        error: 'Max iterations reached without achieving goal',
        screenshots: this.debug ? screenshots : undefined,
      };

    } catch (error: any) {
      this.log(`❌ Error: ${error.message}`);
      return {
        success: false,
        iterations: 0,
        actions,
        error: error.message,
        screenshots: this.debug ? screenshots : undefined,
      };
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  /**
   * Execute an action based on LLM decision
   */
  private async executeAction(analysis: VisionAnalysis): Promise<void> {
    if (!this.page) return;
    
    const action = analysis.suggestedAction;
    
    switch (action.type) {
      case 'click':
        if (action.coordinates) {
          this.log(`   🖱️ Clicking at (${action.coordinates.x}, ${action.coordinates.y})`);
          await this.page.mouse.click(action.coordinates.x, action.coordinates.y);
        }
        break;
        
      case 'type':
        if (action.value) {
          this.log(`   ⌨️ Typing: ${action.value}`);
          await this.page.keyboard.type(action.value);
        }
        break;
        
      case 'scroll':
        this.log('   📜 Scrolling down');
        await this.page.mouse.wheel(0, 500);
        break;
        
      case 'wait':
        this.log('   ⏳ Waiting 3 seconds...');
        await this.page.waitForTimeout(3000);
        break;
    }
  }

  /**
   * Extract structured data from the final screen
   */
  private async extractDataFromScreen(screenshot: Buffer, task: string): Promise<any> {
    const base64Image = screenshot.toString('base64');
    
    // Use Gemini to extract structured data
    const model = (this.vision as any).model;
    
    const prompt = `You just helped complete this task: "${task}"

Looking at this screenshot, extract any relevant structured data that would answer the user's request.

Return as JSON. For example, if the task was about golf tee times:
{
  "teeTimes": [
    { "time": "9:00 AM", "price": "$75", "available": true },
    { "time": "9:15 AM", "price": "$75", "available": true }
  ]
}

Or if it was about finding businesses:
{
  "businesses": [
    { "name": "ABC Company", "phone": "555-1234", "address": "123 Main St" }
  ]
}

Extract whatever is relevant to the completed task.`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      },
    ]);

    const response = result.response.text();
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      return { raw: response };
    }
    
    return { raw: response };
  }
}

/**
 * Simple function to run the agent
 */
export async function runAgent(
  task: string,
  startUrl: string,
  apiKey: string,
  options?: {
    maxIterations?: number;
    extractData?: boolean;
    debug?: boolean;
  }
): Promise<AgentResult> {
  const agent = new DiscoveryAgent(apiKey, options?.debug ?? true);
  
  return agent.execute({
    task,
    startUrl,
    maxIterations: options?.maxIterations ?? 10,
    extractData: options?.extractData ?? true,
  });
}
