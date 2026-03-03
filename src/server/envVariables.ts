import "dotenv/config";

export const { PG_URI } = process.env;
export const { AI_APIKEY } = process.env;
// average response time from the http request is 301 milliseconds
export const model = "moonshotai/Kimi-K2-Instruct-0905:groq";
