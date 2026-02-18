/**
 * Audit HTML Report Template
 * 
 * Full HTML report for web rendering.
 */

export interface AuditReportData {
  businessName: string;
  url: string;
  location: { city: string; state: string };
  industry: string;
  
  authorityScore: number;
  authorityLevel: 'low' | 'medium' | 'high' | 'excellent';
  
  websiteStatus: 'live' | 'dead' | 'error';
  loadTimeMs: number;
  hasSSL: boolean;
  
  servicesFound: string[];
  trustSignals: string[];
  
  schemaItems: Array<{ name: string; status: string; description: string }>;
  schemaScore: number;
  
  citationRate: number;
  competitorsCitedInstead: string[];
  
  reviewCount: number;
  rating: number;
  
  topKeywords: Array<{ keyword: string; volume: number }>;
  
  strengths: string[];
  gaps: string[];
  priorityActions: string[];
  
  estimatedMonthlyValue: number;
  auditedAt: string;
}

/**
 * Render full HTML audit report
 */
export function renderAuditHTML(data: AuditReportData): string {
  const levelColor = getLevelColor(data.authorityLevel);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authority Audit: ${escapeHtml(data.businessName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
    
    .header {
      text-align: center;
      padding: 3rem 0;
      border-bottom: 1px solid #334155;
    }
    .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .header .url { color: #94a3b8; font-size: 0.9rem; }
    
    .score-badge {
      display: inline-block;
      padding: 1.5rem 3rem;
      background: ${levelColor};
      border-radius: 1rem;
      margin: 2rem 0;
    }
    .score-badge .number { font-size: 3rem; font-weight: bold; }
    .score-badge .label { text-transform: uppercase; letter-spacing: 0.1em; }
    
    .section {
      background: #1e293b;
      border-radius: 0.5rem;
      padding: 1.5rem;
      margin: 1.5rem 0;
    }
    .section h2 {
      font-size: 1.1rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      border-bottom: 1px solid #334155;
      padding-bottom: 0.5rem;
    }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stat {
      background: #334155;
      padding: 1rem;
      border-radius: 0.5rem;
      text-align: center;
    }
    .stat .value { font-size: 1.5rem; font-weight: bold; color: #60a5fa; }
    .stat .label { font-size: 0.8rem; color: #94a3b8; }
    
    .list { list-style: none; }
    .list li {
      padding: 0.5rem 0;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .list li:last-child { border-bottom: none; }
    
    .tag {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #334155;
      border-radius: 2rem;
      font-size: 0.8rem;
      margin: 0.25rem;
    }
    
    .strength { color: #22c55e; }
    .gap { color: #f97316; }
    .action { color: #60a5fa; }
    
    .footer {
      text-align: center;
      padding: 2rem;
      color: #64748b;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(data.businessName)}</h1>
      <div class="url">${escapeHtml(data.url)}</div>
      <div class="url">${escapeHtml(data.location.city)}, ${escapeHtml(data.location.state)} • ${escapeHtml(data.industry)}</div>
      
      <div class="score-badge">
        <div class="number">${data.authorityScore}</div>
        <div class="label">${data.authorityLevel} Authority</div>
      </div>
    </div>
    
    <div class="section">
      <h2>📊 Key Metrics</h2>
      <div class="grid">
        <div class="stat">
          <div class="value">${data.citationRate.toFixed(0)}%</div>
          <div class="label">AI Citation Rate</div>
        </div>
        <div class="stat">
          <div class="value">${data.reviewCount}</div>
          <div class="label">Google Reviews</div>
        </div>
        <div class="stat">
          <div class="value">${data.rating > 0 ? data.rating + '★' : 'N/A'}</div>
          <div class="label">Rating</div>
        </div>
        <div class="stat">
          <div class="value">$${data.estimatedMonthlyValue.toLocaleString()}</div>
          <div class="label">Est. Monthly Value</div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>💻 Website Analysis</h2>
      <div class="grid">
        <div class="stat">
          <div class="value">${data.websiteStatus === 'live' ? '✅' : '❌'}</div>
          <div class="label">Status: ${data.websiteStatus}</div>
        </div>
        <div class="stat">
          <div class="value">${data.loadTimeMs}ms</div>
          <div class="label">Load Time</div>
        </div>
        <div class="stat">
          <div class="value">${data.hasSSL ? '🔒' : '⚠️'}</div>
          <div class="label">${data.hasSSL ? 'SSL Active' : 'No SSL'}</div>
        </div>
        <div class="stat">
          <div class="value">${data.schemaScore}</div>
          <div class="label">Schema Score</div>
        </div>
      </div>
    </div>
    
    ${data.servicesFound.length > 0 ? `
    <div class="section">
      <h2>🛠️ Services Found</h2>
      <div>${data.servicesFound.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
    </div>
    ` : ''}
    
    ${data.trustSignals.length > 0 ? `
    <div class="section">
      <h2>✅ Trust Signals</h2>
      <div>${data.trustSignals.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
    </div>
    ` : ''}
    
    <div class="section">
      <h2>💪 Strengths</h2>
      <ul class="list">
        ${data.strengths.map(s => `<li><span class="strength">✓</span> ${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    
    <div class="section">
      <h2>⚠️ Gaps</h2>
      <ul class="list">
        ${data.gaps.map(s => `<li><span class="gap">✗</span> ${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    
    <div class="section">
      <h2>🎯 Priority Actions</h2>
      <ul class="list">
        ${data.priorityActions.map((s, i) => `<li><span class="action">${i + 1}.</span> ${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    
    ${data.competitorsCitedInstead.length > 0 ? `
    <div class="section">
      <h2>👥 Competitors Cited Instead</h2>
      <div>${data.competitorsCitedInstead.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
    </div>
    ` : ''}
    
    <div class="footer">
      <p>Audited on ${new Date(data.auditedAt).toLocaleDateString()}</p>
      <p>Powered by OneClaw Authority Engine</p>
    </div>
  </div>
</body>
</html>
`.trim();
}

// Helpers
function getLevelColor(level: string): string {
  switch (level) {
    case 'excellent': return '#22c55e';
    case 'high': return '#84cc16';
    case 'medium': return '#eab308';
    case 'low': return '#ef4444';
    default: return '#6b7280';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
