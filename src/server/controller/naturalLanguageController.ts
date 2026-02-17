import { type RequestHandler } from 'express';
import { createError } from "../errorHandler";

export const parseNaturalLanguageQuery: RequestHandler = async (req, res, next) => {
  if (!req.body.naturalLanguageQuery) {
    return next(createError('naturalLanguageQuery not found', 400, 'naturalLanguageController'));
  }
  const { naturalLanguageQuery } = req.body;
  console.log('Test');
  console.log(naturalLanguageQuery);

  if (typeof naturalLanguageQuery !== 'string') {
    return next(createError('naturalLanguageQuery not string', 400, 'naturalLanguageController'));
  }
  console.log("Natural language parsing SUCCEEDED")
  res.locals.naturalLanguageQuery = naturalLanguageQuery;
  return next();
};
