import { dataService } from '../caching/dataService';

export default {
  getTrustControls: async (_, res, next) => {
    try {
      // dataService.getTeams() returns { data: any[], source: 'cache' | 'database' }
      const result = await dataService.getControls();

      if (!result) {
        res.locals.dbResults = "No Teams controller data";
      return next();
    }

      // store BOTH data AND metadata in res.locals
      res.locals.dbResults = result.data; // actual team data array
      res.locals.cacheInfo = {          // cache metadata
        source: result.source,
        cached: result.source === 'cache' // set value to boolean (true if source is 'cache')
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