import { dataService } from "../caching/dataService";

export default {
  getTrustFaqs: async (_, res, next) => {
    try {
      const result = await dataService.getFaqs();

      if (!result) {
        res.locals.dbResults = "No FAQs controller data";
        return next();
      }

      res.locals.dbResults = result.data;
      res.locals.cacheInfo = {
        source: result.source,
        cached: result.source === "cache",
      };

      return next();
    } catch (error) {
      const serverError = {
        log: `Error in FAQs Controller middleware: ${error instanceof Error ? error.message : "Unknown error"}`,
        status: 500,
        message: {
          err: "Failed to correctly retrieve the database query for FAQs Controls",
        },
      };
      return next(serverError);
    }
  },
};
