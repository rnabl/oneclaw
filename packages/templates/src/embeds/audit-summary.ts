/**
 * Audit Summary Embed
 * 
 * Rich text embed for chat interfaces (Discord, Telegram, etc.)
 */

export interface AuditSummaryData {
  businessName: string;
  url: string;
  authorityScore: number;
  authorityLevel: 'low' | 'medium' | 'high' | 'excellent';
  citationRate: number;
  reviewCount: number;
  rating: number;
  topStrengths: string[];
  topGaps: string[];
  estimatedMonthlyValue: number;
}

/**
 * Generate Discord-style embed for audit summary
 */
export function renderAuditDiscordEmbed(data: AuditSummaryData): {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
} {
  const scoreEmoji = getScoreEmoji(data.authorityScore);
  const levelColor = getLevelColor(data.authorityLevel);

  return {
    title: `${scoreEmoji} Website Audit: ${data.businessName}`,
    description: `**${data.authorityScore}/100** Authority Score (${data.authorityLevel.toUpperCase()})`,
    color: levelColor,
    fields: [
      {
        name: '🎯 AI Visibility',
        value: `${data.citationRate.toFixed(0)}% citation rate`,
        inline: true,
      },
      {
        name: '⭐ Reviews',
        value: data.reviewCount > 0 
          ? `${data.reviewCount} reviews (${data.rating}★)` 
          : 'No reviews found',
        inline: true,
      },
      {
        name: '💰 Est. Monthly Value',
        value: `$${data.estimatedMonthlyValue.toLocaleString()}`,
        inline: true,
      },
      {
        name: '✅ Top Strengths',
        value: data.topStrengths.slice(0, 3).map(s => `• ${s}`).join('\n') || 'None identified',
        inline: false,
      },
      {
        name: '⚠️ Priority Gaps',
        value: data.topGaps.slice(0, 3).map(s => `• ${s}`).join('\n') || 'None identified',
        inline: false,
      },
    ],
    footer: {
      text: `URL: ${data.url} | Powered by OneClaw`,
    },
  };
}

/**
 * Generate Telegram-style markdown message
 */
export function renderAuditTelegramMessage(data: AuditSummaryData): string {
  const scoreEmoji = getScoreEmoji(data.authorityScore);
  
  return `
${scoreEmoji} *Website Audit: ${escapeMarkdown(data.businessName)}*

*Authority Score:* ${data.authorityScore}/100 (${data.authorityLevel.toUpperCase()})
*AI Visibility:* ${data.citationRate.toFixed(0)}% citation rate
*Reviews:* ${data.reviewCount > 0 ? `${data.reviewCount} (${data.rating}★)` : 'None found'}
*Est. Monthly Value:* $${data.estimatedMonthlyValue.toLocaleString()}

✅ *Strengths:*
${data.topStrengths.slice(0, 3).map(s => `• ${escapeMarkdown(s)}`).join('\n') || '• None identified'}

⚠️ *Gaps:*
${data.topGaps.slice(0, 3).map(s => `• ${escapeMarkdown(s)}`).join('\n') || '• None identified'}

🔗 [View Full Report](${data.url})
`.trim();
}

/**
 * Generate plain text summary
 */
export function renderAuditPlainText(data: AuditSummaryData): string {
  return `
WEBSITE AUDIT: ${data.businessName}
${'-'.repeat(40)}
Authority Score: ${data.authorityScore}/100 (${data.authorityLevel})
AI Visibility: ${data.citationRate.toFixed(0)}% citation rate
Reviews: ${data.reviewCount > 0 ? `${data.reviewCount} (${data.rating}★)` : 'None found'}
Est. Monthly Value: $${data.estimatedMonthlyValue.toLocaleString()}

STRENGTHS:
${data.topStrengths.slice(0, 3).map(s => `  + ${s}`).join('\n') || '  (none identified)'}

GAPS:
${data.topGaps.slice(0, 3).map(s => `  - ${s}`).join('\n') || '  (none identified)'}

URL: ${data.url}
`.trim();
}

// Helpers
function getScoreEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}

function getLevelColor(level: string): number {
  switch (level) {
    case 'excellent': return 0x22c55e; // green
    case 'high': return 0x84cc16; // lime
    case 'medium': return 0xeab308; // yellow
    case 'low': return 0xef4444; // red
    default: return 0x6b7280; // gray
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
