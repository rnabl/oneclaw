// Setup wizard - Simple state machine
let currentStep = 1;
const totalSteps = 4;

const titles = {
  1: 'Welcome to OneClaw',
  2: 'Configure Executors',
  3: 'Pair with Cloud',
  4: 'Test Workflow'
};

function updateSteps() {
  // Update step indicators
  document.querySelectorAll('.step').forEach((step, index) => {
    const stepNum = index + 1;
    if (stepNum <= currentStep) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });
  
  // Update title
  document.getElementById('step-title').textContent = titles[currentStep];
  
  // Show/hide step content
  for (let i = 1; i <= totalSteps; i++) {
    const content = document.getElementById(`step-${i}`);
    if (i === currentStep) {
      content.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  }
}

window.nextStep = function() {
  if (currentStep < totalSteps) {
    currentStep++;
    updateSteps();
  }
};

window.generatePairingCode = async function() {
  const btn = document.querySelector('#pairing-section button');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  
  try {
    // TODO: Actually call API
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Show pairing code
    document.getElementById('pairing-section').classList.add('hidden');
    document.getElementById('pairing-code').classList.remove('hidden');
    
  } catch (error) {
    alert('Failed to generate pairing code');
    btn.disabled = false;
    btn.textContent = 'Generate Pairing Code';
  }
};

// Initialize
updateSteps();
