import { dataService } from "../caching/dataService";

export default {
  getTrustControls: async (_, res, next) => {
    try {
      const result = await dataService.getControls();

      if (!result) {
        res.locals.dbResults = "No Trust controller data";
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
        log: `Error in Trust Controls Controller middleware: ${error instanceof Error ? error.message : "Unknown error"}`,
        status: 500,
        message: {
          err: "Failed to correctly retrieve the database query for Trust Controls",
        },
      };
      return next(serverError);
    }
  },
};

