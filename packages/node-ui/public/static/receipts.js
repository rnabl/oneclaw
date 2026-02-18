// Receipts - Load and display workflow receipts
const API_URL = 'http://localhost:8787';

async function loadReceipts() {
  try {
    const response = await fetch(`${API_URL}/receipts`);
    
    if (!response.ok) {
      throw new Error('Failed to load receipts');
    }
    
    const { receipts } = await response.json();
    
    document.getElementById('loading').classList.add('hidden');
    
    if (receipts.length === 0) {
      document.getElementById('empty').classList.remove('hidden');
    } else {
      const list = document.getElementById('receipt-list');
      
      receipts.forEach(receipt => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `/receipt.html?id=${receipt}`;
        a.textContent = receipt;
        li.appendChild(a);
        list.appendChild(li);
      });
      
      list.classList.remove('hidden');
    }
    
  } catch (error) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('empty').classList.remove('hidden');
  }
}

// Load on page load
loadReceipts();
