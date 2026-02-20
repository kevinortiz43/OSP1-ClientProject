import express from "express";
import {getTrustFaqs} from "../controller/faqController";
import {getTrustControls} from "../controller/trustController";
import {getTeams} from "../controller/teamsController";
import { getCacheStats } from "../caching/cache";
import { dataService } from "../services/dataService";
import { parseNaturalLanguageQuery } from "../controller/naturalLanguageController";
import { queryOfflineOpenAI } from "../controller/openaiController_local";
import { executeDatabaseQuery } from "../controller/databaseController";  
import { triggerBackgroundJudgment, runBackgroundJudgment } from '../controller/backgroundJobs';


const router = express.Router();

router.get("/test", (_, res) => {
  return res.status(200).send("TEST TESTTEST ");
});

// localhost:3000/api/trustControls (added here for easy copy /paste during Postman testing)
router.get("/trustControls", getTrustControls, (_, res) => {
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
// http://localhost:3000/api/admin/cache-stats
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


// http://localhost:3000/api/admin/clear-cache
// endpoint to manually clear cache for 'teams', 'controls', or 'faqs' or empty if want to clear all cache
// Examples: {"type": ""} to clear all or {"type": "teams"} to clear specific keys 
router.post("/admin/clear-cache", (req, res) => {
  const { type } = req.body;

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


// http://localhost:3000/api/ai/query
// fastTextSearch or AI route
router.post(
  '/ai/query',
  parseNaturalLanguageQuery,
  queryOfflineOpenAI, 
  executeDatabaseQuery,
  triggerBackgroundJudgment,
  (_, res) => {
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

    // after response sent, run background jobs (judge / evaluation step \ is non-blocking)
    setImmediate(async () => {
      console.log('SETIMMEDIATE: Starting background jobs');
    
      if (res.locals.judgmentData) {
        try {
          await runBackgroundJudgment(res.locals.judgmentData);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to execute background job: ${errorMessage}`);
        }
      } else {
        console.log('No judgment data to process');
      }
      console.log('SETIMMEDIATE: Finished');
    }); 
  } 
); 

export default router;