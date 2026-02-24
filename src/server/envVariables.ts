import "dotenv/config";

// export const { PG_URI } = process.env;

export const { PG_URI } = process.env
export const { AI_APIKEY } = process.env;

export const model  = "Qwen/Qwen2.5-Coder-7B-Instruct:nscale";

export const apiBase ="http://localhost:3000/api"