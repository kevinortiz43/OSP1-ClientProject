import { Elysia, t } from "elysia";
import { dataService } from "../caching/dataService";
import { getCacheStats } from "../caching/cache";
import { databaseQuery } from "../controller/databaseController";
import { generateAIResponse } from "../controller/AI_Controller/generateAIResponse";
import { QueryOpenAI } from "../controller/AI_Controller/onlineAIController";
import { queryOfflineOpenAI } from "../controller/openaiController_local";
import {
  runBackgroundJudgment,
  triggerBackgroundJudgment,
} from "../controller/backgroundJobs";
export const router = new Elysia();

router.get("/", () => "Test");

router.get("test", ({ _body, set }) => {
  console.log("test");
  set.status = 201;
  return "test";
});

router.get("/trustControls", async ({ error }) => {
  try {
    const result = await dataService.getControls();

    if (!result) {
      return error(404, { message: "No Trust Controls data found" });
    }

    return {
      source: result.source,
      data: result.data,
      cached: result.source === "cache",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `Error in Trust Controls route: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return error(500, { err: "Failed to retrieve Trust Controls data" });
  }
});

router.post(
  "/ai-online",
  async ({ body, error }) => {
    try {
      // Step 1: Convert natural language to SQL
      const { naturalLanguageQuery } = body;
      const { cleanSQL } = await QueryOpenAI({
        naturalLanguageQuery,
        sqlQuery: "",
      });

      if (!cleanSQL) {
        return error(500, { err: "Failed to generate SQL query" });
      }

      // Step 2: Run the SQL against the database
      const { rows } = await databaseQuery(cleanSQL);

      // Step 3: Generate AI response from DB results
      return await generateAIResponse({
        naturalLanguageQuery,
        databaseQueryResult: rows,
        sqlQuery: cleanSQL,
      });
    } catch (err) {
      return error(500, { err: "Failed to process AI query" });
    }
  },
  {
    body: t.Object({
      naturalLanguageQuery: t.String(),
    }),
  },
);

router.get("/allTeams", async ({ error }) => {
  try {
    const result = await dataService.getTeams();

    if (!result) {
      return error(404, { message: "No All Teams data found" });
    }

    return {
      source: result.source,
      data: result.data,
      cached: result.source === "cache",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `Error in Trust Controls route: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return error(500, { err: "Failed to retrieve All Teams data" });
  }
});

router.get("/trustFaqs", async ({ error }) => {
  try {
    const result = await dataService.getFaqs();

    if (!result) {
      return error(404, { message: "No FAQs data found" });
    }

    return {
      source: result.source,
      data: result.data,
      cached: result.source === "cache",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `Error in Trust Controls route: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return error(500, { err: "Failed to retrieve FAQs data" });
  }
});

router.post(
  "/admin/clear-cache",
  ({ body }) => {
    const { type } = body;

    dataService.clearCache(type);
    const statsReset = getCacheStats();

    return {
      success: true,
      message: type ? `Cache cleared for ${type}` : "All cache cleared",
      timestamp: new Date().toISOString(),
      hits: statsReset.hits,
      misses: statsReset.misses,
      keys: statsReset.keys,
      ksize: statsReset.ksize,
      vsize: statsReset.vsize,
    };
  },
  {
    body: t.Object({
      type: t.Optional(
        t.Union([t.Literal("teams"), t.Literal("controls"), t.Literal("faqs")]),
      ),
    }),
  },
);

router.get("/admin/cache-stats", () => {
  const stats = getCacheStats();

  return {
    hits: stats.hits,
    misses: stats.misses,
    keys: stats.keys,
    ksize: stats.ksize,
    vsize: stats.vsize,
  };
});

router.post(
  "/ai/query",
  async ({ body, error }) => {
    try {
      const { naturalLanguageQuery } = body;

      // Step 1: Offline AI — cache check, fast search, or SQL generation
      const {
        queryResult,
        databaseQuery: sqlString,
        executionTime,
      } = await queryOfflineOpenAI(naturalLanguageQuery);

      const { rows } = sqlString
        ? await databaseQuery(sqlString)
        : { rows: queryResult.results };

      // Step 3: Background judgment (non-blocking)
      const bgData = triggerBackgroundJudgment({
        naturalLanguageQuery,
        sqlQuery: sqlString ?? "",
        results: rows,
        source: queryResult.source,
        executionTime: parseInt(executionTime ?? "0"),
      });

      if (bgData) {
        queueMicrotask(async () => {
          console.log("Background job: Starting judgment");
          try {
            await runBackgroundJudgment(bgData);
          } catch (err) {
            console.error(
              `Background job failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
          console.log("Background job: Finished");
        });
      }

      return {
        success: true,
        data: {
          query: naturalLanguageQuery,
          source: queryResult.source,
          cached: queryResult.cached,
          results: rows,
          formatted: queryResult.formatted,
          sql: sqlString, // ← updated
          executionTime,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return error(500, { err: "Failed to process AI query" });
    }
  },
  {
    body: t.Object({
      naturalLanguageQuery: t.String(),
    }),
  },
);
