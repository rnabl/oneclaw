const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Load CSV
const csv = fs.readFileSync('.data/hvac-leads-clean.csv', 'utf-8');
const records = parse(csv, { columns: true });
const withOwner = records.filter(r => r.owner_name && r.owner_name.trim());

// Load analyses
const analyses = fs.readdirSync('.data/website-analyses').filter(f => f.endsWith('.json'));
const analyzedNames = analyses.map(f => {
  const data = JSON.parse(fs.readFileSync('.data/website-analyses/' + f, 'utf-8'));
  return data.business_name;
});

console.log('=== CHECKING WHICH BUSINESSES WERE ANALYZED ===\n');
console.log('CSV businesses with owner names:', withOwner.length);
console.log('Website analyses done:', analyses.length);
console.log('');

const csvNames = withOwner.map(r => r.name.toLowerCase().trim());
const analyzedLower = analyzedNames.map(n => n?.toLowerCase().trim());

const matched = csvNames.filter(name => analyzedLower.includes(name));
const notAnalyzed = withOwner.filter(r => !analyzedLower.includes(r.name.toLowerCase().trim()));

console.log('✅ Matched (have both owner name + analysis):', matched.length);
console.log('❌ NOT analyzed (have owner but no analysis):', notAnalyzed.length);
console.log('');

console.log('=== SAMPLE: Businesses WITH owner names but NO analysis ===');
notAnalyzed.slice(0, 15).forEach((r, i) => {
  console.log(`${i+1}. ${r.name} (${r.city}, ${r.state})`);
  console.log(`   Owner: ${r.owner_name} (${r.owner_role || 'N/A'})`);
  console.log(`   Website: ${r.website || 'N/A'}`);
  console.log('');
});

// Check the reverse: analyzed but no owner
const analyzedButNoOwner = analyzedNames.filter(name => 
  name && !csvNames.includes(name.toLowerCase().trim())
);

console.log('\n=== REVERSE CHECK: Analyzed businesses NOT in CSV with owner names ===');
console.log('Count:', analyzedButNoOwner.length);
console.log('\nSample:');
analyzedButNoOwner.slice(0, 5).forEach((name, i) => {
  console.log(`${i+1}. ${name}`);
});
