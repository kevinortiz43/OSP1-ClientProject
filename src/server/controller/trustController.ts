import { dataService } from "../services/dataService";
import { type RequestHandler } from "express";
import { createError } from "../errorHandler";

export const getTrustControls: RequestHandler = async (_, res, next) => {
    try {
      // dataService.getControls() returns { data: any[], source: 'cache' | 'database' }
      const result = await dataService.getControls();

      if (!result) {
        res.locals.dbResults = "No trust controller data";
        return next(createError('Trusts not found - no data returned', 404, 'trustController'));
      }

      // store BOTH data AND metadata in res.locals
      res.locals.dbResults = result.data; // trust controls data array
      res.locals.cacheInfo = {
        // cache metadata
        source: result.source,
        cached: result.source === "cache", // set value to boolean (true if source is 'cache')
      };

      return next();
    } catch (error) {
      // Type guard to safely access error.message
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
      
      return next(createError(
        `Failed to retrieve trust data from database or cache: ${errorMessage}`,
        500,
        'trustController'
      ));
    }
  };