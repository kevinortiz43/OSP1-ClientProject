import express from "express";
import faqController from "../controller/faqController";
import trustController from "../controller/trustController";
import teamsController from "../controller/teamsController";
import { getCacheStats } from "../caching/cache";
import { dataService } from '../caching/dataService';

const router = express.Router();

router.get("/test", (_, res) => {
  return res.status(200).send("TEST TESTTEST ");
});


// localhost:3000/api/trustControls
router.get("/trustControls", 
  trustController.getTrustControls,
  (req, res) => {
  // res.locals.dbResults contains the team data array
  // res.locals.cacheInfo contains cache metadata
  const controlsData = res.locals.dbResults;
  const cacheInfo = res.locals.cacheInfo || { source: 'unknown', cached: false };
  
  return res.json({
    source: cacheInfo.source,
    data: controlsData,
    cached: cacheInfo.cached,
    timestamp: new Date().toISOString()
  });
});

// localhost:3000/api/allTeams
router.get("/allTeams", teamsController.getTeams, (req, res) => {
  // res.locals.dbResults contains the team data array
  // res.locals.cacheInfo contains cache metadata
  const teamsData = res.locals.dbResults;
  const cacheInfo = res.locals.cacheInfo || { source: 'unknown', cached: false };
  
  return res.json({
    source: cacheInfo.source,
    data: teamsData,
    cached: cacheInfo.cached,
    timestamp: new Date().toISOString()
  });
});

// localhost:3000/api/trustFaqs
router.get("/trustFaqs", faqController.getTrustFaqs, (req, res) => {
  // res.locals.dbResults contains the team data array
  // res.locals.cacheInfo contains cache metadata
  const faqsData = res.locals.dbResults;
  const cacheInfo = res.locals.cacheInfo || { source: 'unknown', cached: false };
  
  return res.json({
    source: cacheInfo.source,
    data: faqsData,
    cached: cacheInfo.cached,
    timestamp: new Date().toISOString()
  });
});

// endpoint to manually clear cache for 'teams', 'controls', or 'faqs' or empty if want to clear all cache (for admin)

// http://localhost:3000/api/admin/clear-cache
router.post('/admin/clear-cache', (req, res) => {
  
  const { type } = req.body; // 'teams', 'controls', 'faqs', or leave empty if want to clear all cache keys
  
  dataService.clearCache(type);
  const statsReset = getCacheStats();
  
  res.json({
    success: true,
    message: type ? `Cache cleared for ${type}` : 'All cache cleared',
    timestamp: new Date().toISOString(),
    hits: statsReset.hits,
    misses: statsReset.misses,
    keys: statsReset.keys,
    ksize: statsReset.ksize,
    vsize: statsReset.vsize
  });
});

// get cache stats
// http://localhost:3000/api/admin/cache-stats  (seems buggy)
router.get('/admin/cache-stats', (req, res) => {
  const stats = getCacheStats();
  res.json({
    hits: stats.hits,
    misses: stats.misses,
    keys: stats.keys,
    ksize: stats.ksize,
    vsize: stats.vsize
  });
});




export default router;



// test endpoint to see that eTags are automatically generated
// router.get("/test-etag", (req, res) => {
//   //check if Express adds anything automatically
//   console.log("testing Express ETag");
//   console.log("1. Initial headers:", res.getHeaders());
  
//   // test what happens with res.json()?
//   const data = { id: 1, name: "Test" };
  
//   // manually set header to compare
//   res.setHeader('X-Test-Manual', 'manual-header');
  
//   console.log("2. After setting manual header:", res.getHeaders());
  
//   // Send the response
//   res.json(data);
  
//   console.log("3. Headers sent to client (check Dev Tools Network tab)");
// });