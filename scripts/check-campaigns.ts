import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get counts by template type
  const { data: campaigns } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('template_name, approval_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  
  console.log('\n📊 Campaign Breakdown:\n');
  
  const byTemplate: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  
  campaigns?.forEach(c => {
    byTemplate[c.template_name || 'none'] = (byTemplate[c.template_name || 'none'] || 0) + 1;
    byStatus[c.approval_status || 'none'] = (byStatus[c.approval_status || 'none'] || 0) + 1;
  });
  
  console.log('By Template:');
  Object.entries(byTemplate).forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`);
  });
  
  console.log('\nBy Status:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  
  console.log('\nMost Recent 10:');
  campaigns?.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.template_name} (${c.approval_status}) - ${new Date(c.created_at).toLocaleString()}`);
  });
  
  // Count total with reviews
  const { count: totalCampaigns } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id', { count: 'exact', head: true });
  
  console.log(`\n📧 Total campaigns: ${totalCampaigns}`);
  
  // Count leads with reviews that DON'T have campaigns
  const { data: allCampaigns } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('lead_id');
  
  const campaignLeadIds = new Set(allCampaigns?.map(c => c.lead_id) || []);
  
  const { data: leadsWithReviews } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, source_metadata')
    .not('google_reviews', 'is', null)
    .gte('google_reviews', 1);
  
  const leadsWithGoodReviews = leadsWithReviews?.filter(lead => {
    const reviews = lead.source_metadata?.reviews || [];
    const fiveStarReviews = reviews.filter((r: any) => 
      r.rating === 5 && 
      r.reviewer_name && 
      r.reviewer_name.split(' ').length >= 2
    );
    return fiveStarReviews.length > 0;
  }) || [];
  
  const leadsWithoutCampaigns = leadsWithGoodReviews.filter(lead => 
    !campaignLeadIds.has(lead.id)
  );
  
  console.log(`\n📊 Leads with 5-star reviews:`);
  console.log(`   Total: ${leadsWithGoodReviews.length}`);
  console.log(`   Have campaigns: ${leadsWithGoodReviews.length - leadsWithoutCampaigns.length}`);
  console.log(`   Need campaigns: ${leadsWithoutCampaigns.length}`);
  
  if (leadsWithoutCampaigns.length > 0) {
    console.log('\nSample leads without campaigns:');
    leadsWithoutCampaigns.slice(0, 5).forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.company_name}`);
    });
  }
}

main().catch(console.error);
