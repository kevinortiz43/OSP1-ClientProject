import { type Request, type Response, type NextFunction } from "express";
import { type ServerError } from "./types";
import { type ErrorRequestHandler } from "express";

// creates consistent ServerError objects (factory function)
export const createError = (
  message: string,
  status: number = 500,
  context?: string
): ServerError => ({
  log: `${context ? `[${context}] ` : ''}${message}`,
  status,
  message: { err: message }
});

// global error handler automatically catches any error passed to next() and formats the response:
export const errorHandler: ErrorRequestHandler = (
  err: Error | ServerError, req, res, _next) => {
  // default values
  let status = 500;
  let responseMessage = { err: 'Internal server error' };
  
  if ('status' in err && 'message' in err) {
    status = err.status;
    responseMessage = err.message;
    console.error(err.log);
  } else if (err instanceof Error) {
    responseMessage = { err: err.message };
    console.error(err.stack);
  }

  res.status(status).json({
    error: responseMessage,
    timestamp: new Date().toISOString()
  });
};

// 404 handler - catches route URLs that don't exist
export const notFound = (req: Request, res: Response, next: NextFunction) => {
  next(createError(`Cannot ${req.method} ${req.url}`, 404, 'NotFound'));
};