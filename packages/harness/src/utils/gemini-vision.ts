/**
 * Gemini Flash Vision Helper
 * 
 * Ultra-cheap vision API for screenshot analysis
 * Cost: ~$0.0002 per call (25x cheaper than Claude)
 * 
 * AGENT LOOP APPROACH (like OpenClaw):
 * 1. See - Take screenshot
 * 2. Think - Ask LLM what to do
 * 3. Act - Execute the action (click, type, scroll)
 * 4. Observe - Check the result
 * 5. Loop - Repeat until goal achieved or max iterations
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface VisionAction {
  type: 'click' | 'type' | 'scroll' | 'wait' | 'done' | 'fail';
  target?: string;
  coordinates?: { x: number; y: number };
  value?: string;
  reasoning: string;
}

export interface VisionAnalysis {
  description: string;
  pageState: 'loading' | 'ready' | 'error' | 'success';
  suggestedAction: VisionAction;
  goalProgress: number; // 0-100
  confidence: 'high' | 'medium' | 'low';
}

export interface TeeTimeVision {
  times: Array<{
    time: string; // "9:30 AM"
    price?: string;
    players?: number;
    available: boolean;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

export class GeminiVision {
  private client: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  /**
   * AGENT LOOP: Analyze screenshot and decide next action
   * This is the CORE of the OpenClaw-style reasoning loop
   */
  async analyzeAndDecide(
    screenshot: Buffer,
    goal: string,
    previousActions: string[] = [],
    iteration: number = 1
  ): Promise<VisionAnalysis> {
    const base64Image = screenshot.toString('base64');

    const prompt = `You are an AI agent controlling a web browser. Your job is to achieve a goal by analyzing what you see and deciding what action to take next.

GOAL: ${goal}

ITERATION: ${iteration} of max 10

PREVIOUS ACTIONS TAKEN:
${previousActions.length > 0 ? previousActions.map((a, i) => `${i+1}. ${a}`).join('\n') : 'None yet - this is the first action'}

IMPORTANT INSTRUCTIONS:
1. Look at the screenshot carefully. What do you see?
2. Is the page still loading? Look for spinners, "Loading..." text, or incomplete content.
3. Is there a cookie banner, popup, or modal blocking the content? You may need to close it first.
4. Can you see what you need for the goal? If yes, action type should be "done".
5. If you need to interact with an element, estimate its CENTER coordinates in pixels.
6. The viewport is 1920x1080 pixels.

COORDINATE SYSTEM:
- The image is 1920 pixels wide and 1080 pixels tall
- Top-left is (0, 0), bottom-right is (1920, 1080)
- Horizontal center is x=960
- Most navigation bars are at y=50-150
- Main content is typically at y=200-800
- Footer is typically at y=900+
- IMPORTANT: Estimate coordinates VERY carefully. Look at the relative position.

Respond ONLY with valid JSON (no markdown, no explanation):

{
  "description": "Brief description of what you see on the screen",
  "pageState": "loading" | "ready" | "error" | "success",
  "suggestedAction": {
    "type": "click" | "type" | "scroll" | "wait" | "done" | "fail",
    "target": "what element to interact with",
    "coordinates": { "x": 960, "y": 540 },
    "value": "text to type if type action",
    "reasoning": "why this action will help achieve the goal"
  },
  "goalProgress": 0-100,
  "confidence": "high" | "medium" | "low"
}

COORDINATE ESTIMATION TIPS:
- A button in the upper-left quadrant might be around x=200-400, y=200-400
- A button in the center-left might be around x=200-400, y=500-600
- A date picker arrow is usually small, about 20-30px in size
- Look for the EXACT pixel position of the element's CENTER`;

    const result = await this.model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      },
    ]);

    const response = result.response.text();
    
    // Try to parse JSON
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse Gemini response:', e);
    }

    // Fallback
    return {
      description: response,
      pageState: 'error',
      suggestedAction: {
        type: 'fail',
        reasoning: 'Could not parse LLM response',
      },
      goalProgress: 0,
      confidence: 'low',
    };
  }

  /**
   * Extract tee times from a screenshot
   */
  async extractTeeTimes(
    screenshot: Buffer,
    criteria: { date: string; startHour: number; endHour: number; partySize: number }
  ): Promise<TeeTimeVision> {
    const base64Image = screenshot.toString('base64');

    const prompt = `You are analyzing a golf tee time booking page screenshot.

LOOKING FOR:
- Date: ${criteria.date}
- Time range: ${criteria.startHour}:00 - ${criteria.endHour}:00
- Party size: ${criteria.partySize} players

Please extract ALL visible tee times in the specified time range and respond in JSON format:

{
  "times": [
    {
      "time": "9:00 AM",
      "price": "$75.00",
      "players": 4,
      "available": true
    },
    {
      "time": "9:15 AM",
      "price": "$75.00",
      "players": 4,
      "available": true
    }
  ],
  "confidence": "high" | "medium" | "low"
}

If you don't see any tee times, return empty array with confidence "low".
Only include times within the ${criteria.startHour}:00 - ${criteria.endHour}:00 range.`;

    const result = await this.model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      },
    ]);

    const response = result.response.text();

    // Try to parse JSON
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback
    }

    return {
      times: [],
      confidence: 'low',
    };
  }

  /**
   * Find a specific UI element in a screenshot
   */
  async findElement(
    screenshot: Buffer,
    elementDescription: string
  ): Promise<{ found: boolean; coordinates?: { x: number; y: number }; confidence: string }> {
    const base64Image = screenshot.toString('base64');

    const prompt = `Find this UI element in the screenshot: "${elementDescription}"

Respond in JSON format:
{
  "found": true | false,
  "coordinates": { "x": 100, "y": 200 },
  "confidence": "high" | "medium" | "low"
}

If not found, set found to false and omit coordinates.`;

    const result = await this.model.generateContent([
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
      // Fallback
    }

    return {
      found: false,
      confidence: 'low',
    };
  }
}
