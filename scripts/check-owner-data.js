const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csv = fs.readFileSync('.data/hvac-leads-clean.csv', 'utf-8');
const records = parse(csv, { columns: true });

console.log('Column names:', Object.keys(records[0]));
console.log('\n=== SAMPLE RECORDS (first 10) ===\n');

records.slice(0, 10).forEach((r, i) => {
  console.log(`#${i+1}: ${r.name}`);
  console.log('  owner_name:', r.owner_name || '(empty)');
  console.log('  owner_role:', r.owner_role || '(empty)');
  console.log('  owner_email:', r.owner_email || '(empty)');
  console.log('  owner_linkedin:', r.owner_linkedin || '(empty)');
  console.log('');
});

console.log('=== STATS ===');
const withOwner = records.filter(r => r.owner_name && r.owner_name.trim()).length;
console.log(`Total records: ${records.length}`);
console.log(`With owner_name: ${withOwner} (${(withOwner/records.length*100).toFixed(1)}%)`);

const withEmail = records.filter(r => r.owner_email && r.owner_email.trim()).length;
console.log(`With owner_email: ${withEmail} (${(withEmail/records.length*100).toFixed(1)}%)`);

const withLinkedIn = records.filter(r => r.owner_linkedin && r.owner_linkedin.trim()).length;
console.log(`With owner_linkedin: ${withLinkedIn} (${(withLinkedIn/records.length*100).toFixed(1)}%)`);

// Show a few examples WITH owner data
console.log('\n=== EXAMPLES WITH OWNER DATA ===\n');
const withOwnerData = records.filter(r => r.owner_name && r.owner_name.trim());
withOwnerData.slice(0, 5).forEach((r, i) => {
  console.log(`${i+1}. ${r.name} (${r.city}, ${r.state})`);
  console.log(`   Owner: ${r.owner_name} (${r.owner_role || 'N/A'})`);
  console.log(`   Email: ${r.owner_email || 'N/A'}`);
  console.log('');
});
