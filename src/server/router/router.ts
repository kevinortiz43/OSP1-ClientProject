import express from "express";
import {getTrustFaqs} from "../controller/faqController";
import {getTrustControls} from "../controller/trustController";
import {getTeams} from "../controller/teamsController";
import { getCacheStats } from "../caching/cache";
import { dataService } from "../services/dataService";
import { parseNaturalLanguageQuery } from "../controller/naturalLanguageController";
import { queryOfflineOpenAI } from "../controller/openaiController_local";
import { executeDatabaseQuery } from "../controller/databaseController";  
import { triggerBackgroundJudgment } from '../controller/backgroundJobs';


const router = express.Router();

router.get("/test", (_, res) => {
  return res.status(200).send("TEST TESTTEST ");
});

// localhost:3000/api/trustControls
router.get("/trustControls", getTrustControls, (_, res) => {
  // res.locals.dbResults contains the team data array
  // res.locals.cacheInfo contains cache metadata
  const controlsData = res.locals.dbResults;
  const cacheInfo = res.locals.cacheInfo || {
    source: "unknown",
    cached: false,
  };

  return res.json({
    source: cacheInfo.source,
    data: controlsData,
    cached: cacheInfo.cached,
    timestamp: new Date().toISOString(),
  });
});

// localhost:3000/api/allTeams
router.get("/allTeams", getTeams, (_, res) => {
  // res.locals.dbResults contains the team data array
  // res.locals.cacheInfo contains cache metadata
  const teamsData = res.locals.dbResults;
  const cacheInfo = res.locals.cacheInfo || {
    source: "unknown",
    cached: false,
  };

  return res.json({
    source: cacheInfo.source,
    data: teamsData,
    cached: cacheInfo.cached,
    timestamp: new Date().toISOString(),
  });
});

// localhost:3000/api/trustFaqs
router.get("/trustFaqs", getTrustFaqs, (_, res) => {
  // res.locals.dbResults contains the team data array
  // res.locals.cacheInfo contains cache metadata
  const faqsData = res.locals.dbResults;
  const cacheInfo = res.locals.cacheInfo || {
    source: "unknown",
    cached: false,
  };

  return res.json({
    source: cacheInfo.source,
    data: faqsData,
    cached: cacheInfo.cached,
    timestamp: new Date().toISOString(),
  });
});

// get cache stats
// http://localhost:3000/api/admin/cache-stats  (sometimes works, sometimes need to try again)
router.get("/admin/cache-stats", (_, res) => {
  const stats = getCacheStats();
  res.json({
    hits: stats.hits,
    misses: stats.misses,
    keys: stats.keys,
    ksize: stats.ksize,
    vsize: stats.vsize,
  });
});


// endpoint to manually clear cache for 'teams', 'controls', or 'faqs' or empty if want to clear all cache (for admin)
// http://localhost:3000/api/admin/clear-cache
// Example: {"type": ""} to clear all or {"type": "teams"} to clear specific keys 
router.post("/admin/clear-cache", (req, res) => {
  const { type } = req.body; // 'teams', 'controls', 'faqs', or leave empty if want to clear all cache keys

  dataService.clearCache(type);
  const statsReset = getCacheStats();

  res.json({
    success: true,
    message: type ? `Cache cleared for ${type}` : "All cache cleared",
    timestamp: new Date().toISOString(),
    hits: statsReset.hits,
    misses: statsReset.misses,
    keys: statsReset.keys,
    ksize: statsReset.ksize,
    vsize: statsReset.vsize,
  });
});



// POST: clean version
// http://localhost:3000/api/ai/query
router.post(
  '/ai/query',
  parseNaturalLanguageQuery,
  queryOfflineOpenAI, 
  executeDatabaseQuery,
  triggerBackgroundJudgment,
  (_, res) => {
    // Send response immediately
    res.status(200).json({
      success: true,
      data: {
        query: res.locals.naturalLanguageQuery,
        source: res.locals.queryResult?.source || 'unknown',
        cached: res.locals.queryResult?.cached || false,
        results: res.locals.queryResult?.results || res.locals.databaseQueryResult || [],
        formatted: res.locals.queryResult?.formatted,
        sql: res.locals.databaseQuery,
        executionTime: res.locals.executionTime
      },
      timestamp: new Date().toISOString()
    });

    // AFTER response sent, run background jobs
    setImmediate(async () => {
    console.log('SETIMMEDIATE: Starting background jobs');
  
  // Only call if we have data
  if (res.locals.judgmentData) {
    try {
      const backgroundModule = await import('../controller/backgroundJobs');
      await backgroundModule.runBackgroundJudgment(res.locals.judgmentData);
    } catch (error) {
      // Only log if the actual import/execution fails
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to execute background job: ${errorMessage}`);
    }
  } else {
    console.log('⚠ No judgment data to process');
  }
  console.log('SETIMMEDIATE: Finished');
});

export default router;

// POST: for debugging 
// router.post(
//   '/ai/query',
//   (req, res, next) => {
//     console.log('ROUTER: Entering /ai/query chain');
//     next();
//   },
  
//   parseNaturalLanguageQuery,
//   (req, res, next) => {
//     console.log('After parseNaturalLanguageQuery');
//     console.log('   naturalLanguageQuery:', res.locals.naturalLanguageQuery);
//     next();
//   },
  
//   queryOfflineOpenAI, 
//  (req, res, next) => {
//     console.log('After queryOfflineOpenAI');
//     console.log('   source:', res.locals.queryResult?.source);
//     console.log('   hasSQL:', !!res.locals.databaseQuery);
//     next();
//   },
  
//   executeDatabaseQuery,
//   (req, res, next) => {
//     console.log('After executeDatabaseQuery');
//     console.log('   results count:', (res.locals.databaseQueryResult || []).length);
//     next();
//   },
  
//   triggerBackgroundJudgment,
//   (req, res, next) => {
//     console.log('After triggerBackgroundJudgment');
//     console.log('   judgmentData exists?', !!res.locals.judgmentData);
//     next();
//   },
  
//   (_req, res) => {
//     console.log('Sending response');
    
//     res.status(200).json({
//       success: true,
//       data: {
//         query: res.locals.naturalLanguageQuery,
//         source: res.locals.queryResult?.source || 'unknown',
//         cached: res.locals.queryResult?.cached || false,
//         results: res.locals.queryResult?.results || res.locals.databaseQueryResult || [],
//         formatted: res.locals.queryResult?.formatted,
//         sql: res.locals.databaseQuery,
//         executionTime: res.locals.executionTime
//       },
//       timestamp: new Date().toISOString()
//     });


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
