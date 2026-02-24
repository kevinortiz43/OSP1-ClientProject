import { Elysia, t } from "elysia";
import { dataService } from "../caching/dataService";
import { getCacheStats } from "../caching/cache";
import { databaseQuery } from "../controller/AI_Controller/databaseController";
import { generateAIResponse } from "../controller/AI_Controller/generateAIResponse";
import { QueryOpenAI } from "../controller/AI_Controller/onlineAIController";

export const router = new Elysia();
router.get("/", () => "Test");

router.get("test", ({ set }) => {
  set.status = 201;
  return "Testing HTTP /api/tests";
});

router.get("/trustControls", async ({ set }) => {
  try {
    const result = await dataService.getControls();

    if (!result) {
      set.status = 404;
      return { message: "No Trust Controls data found" };
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
    set.status = 500;
    return { error: "Failed to retrieve Trust Controls data" };
  }
});

router.post(
  "/ai-online",
  async ({ body, set }) => {
    try {
      const { naturalLanguageQuery } = body;
      const { cleanSQL } = await QueryOpenAI({
        naturalLanguageQuery,
        sqlQuery: "",
      });

      if (!cleanSQL) {
        set.status = 500;
        return { error: "Failed to generate SQL query" };
      }

      const { rows } = await databaseQuery(cleanSQL);

      return await generateAIResponse({
        naturalLanguageQuery,
        databaseQueryResult: rows,
        sqlQuery: cleanSQL,
      });
    } catch (_error) {
      set.status = 500;
      return { error: "Failed to process AI query" };
    }
  },
  {
    body: t.Object({
      naturalLanguageQuery: t.String(),
    }),
  },
);

router.get("/allTeams", async ({ set }) => {
  try {
    const result = await dataService.getTeams();

    if (!result) {
      set.status = 404;
      return { message: "No All Teams data found" };
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
    set.status = 500;
    return { error: "Failed to retrieve All Teams data" };
  }
});

router.get("/trustFaqs", async ({ set }) => {
  try {
    const result = await dataService.getFaqs();

    if (!result) {
      set.status = 404;
      return { message: "No FAQs data found" };
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
    set.status = 500;
    return { error: "Failed to retrieve FAQs data" };
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
