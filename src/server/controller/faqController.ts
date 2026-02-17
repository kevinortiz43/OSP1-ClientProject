import { dataService } from "../services/dataService";
import { createError } from "../errorHandler";
import { type RequestHandler } from "express";

export const getTrustFaqs: RequestHandler = async (_, res, next) => {
    try {
      // dataService.getFaqs() returns { data: any[], source: 'cache' | 'database' }
      const result = await dataService.getFaqs();

      if (!result) {
        res.locals.dbResults = "No FAQ controller data";
        return next(createError('FAQs not found - no data returned', 404, 'FAQController'));
      }

      // store BOTH data AND metadata in res.locals
      res.locals.dbResults = result.data; // faqs data array
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
        `Failed to retrieve FAQs from database or cache: ${errorMessage}`,
        500,
        'FAQController'
      ));
    }
  };