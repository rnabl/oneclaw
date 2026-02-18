// Dashboard - Load and display node config
const API_URL = 'http://localhost:8787';

async function loadNodeConfig() {
  try {
    const response = await fetch(`${API_URL}/config`);
    
    if (!response.ok) {
      throw new Error('Failed to load config');
    }
    
    const { config } = await response.json();
    
    // Update UI
    document.getElementById('node-id').textContent = config.node.id;
    document.getElementById('node-name').textContent = config.node.name;
    document.getElementById('node-env').textContent = config.node.environment;
    document.getElementById('node-llm').textContent = 
      `${config.llm.provider} / ${config.llm.model}`;
    document.getElementById('node-security').textContent = config.security.mode;
    
    // Domains
    const domainsList = document.getElementById('node-domains');
    config.http.allowed_domains.forEach(domain => {
      const li = document.createElement('li');
      li.textContent = domain;
      domainsList.appendChild(li);
    });
    
    // Show content, hide loading
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
    
  } catch (error) {
    document.getElementById('loading').classList.add('hidden');
    const errorEl = document.getElementById('error');
    errorEl.textContent = 
      'Cannot connect to daemon. Start with: oneclaw daemon';
    errorEl.classList.remove('hidden');
  }
}

// Load on page load
loadNodeConfig();
