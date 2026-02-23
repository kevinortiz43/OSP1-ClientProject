// bun-compatible error handler (no longer use express)

export class AppError extends Error {
  status: number;
  context?: string;

  constructor(message: string, status: number = 500, context?: string) {
    super(message);
    this.status = status;
    this.context = context;
    this.name = 'AppError';
  }
}

export const createError = (message: string, status: number = 500, context?: string): AppError => {
  return new AppError(message, status, context);
};