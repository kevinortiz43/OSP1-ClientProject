import { dataService } from "../services/dataService";
import { type RequestHandler } from "express";
import { createError } from "../errorHandler";

export const getTeams: RequestHandler = async (_, res, next) => {
    try {
      // dataService.getTeams() returns { data: any[], source: 'cache' | 'database' }
      const result = await dataService.getTeams();

      if (!result) {
        res.locals.dbResults = "No Teams controller data";
        return next(createError('Teams not found - no data returned', 404, 'teamsController'));
      }

      // store BOTH data AND metadata in res.locals
      res.locals.dbResults = result.data; // actual team data array
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
        `Failed to retrieve teams from database or cache: ${errorMessage}`,
        500,
        'teamsController'
      ));
    }
  }
