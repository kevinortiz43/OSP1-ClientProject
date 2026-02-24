export type ServerError = {
  log: string;
  status: number;
  message: { error: string };
};
