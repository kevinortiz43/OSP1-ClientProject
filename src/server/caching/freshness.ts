import { dockerPool } from "./db_connect_agnostic.js";


// initialize freshness at server start
let freshness = {
  teams: null as Date | null,
  controls: null as Date | null,
  faqs: null as Date | null
};

// extract updatedAt timestampz
export async function initFreshness() {
  const [teams, controls, faqs] = await Promise.all([
    dockerPool.query(`SELECT MAX("updatedAt") as max FROM "allTeams"`),
    dockerPool.query(`SELECT MAX("updatedAt") as max FROM "allTrustControls"`),
    dockerPool.query(`SELECT MAX("updatedAt") as max FROM "allTrustFaqs_categories"`)
  ]);
  
  freshness.teams = teams.rows[0].max;
  freshness.controls = controls.rows[0].max;
  freshness.faqs = faqs.rows[0].max;
  
  console.log('Freshness initialized:', freshness);
}

// function that can be called whenever admin CREATE, UPDATE (these routes aren't yet written), might need another for DELETE 
export function markStale(resource: 'teams' | 'controls' | 'faqs') {
  freshness[resource] = new Date(); // mark as "just now"
  console.log(`Marked ${resource} stale`);
}

// get current freshness
export function getFreshness() {
  return { ...freshness };
}

