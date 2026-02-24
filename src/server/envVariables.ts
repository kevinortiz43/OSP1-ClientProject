import "dotenv/config";

// export const { PG_URI } = process.env;

export const { PG_URI } = process.env;
export const { AI_APIKEY } = process.env;

// average response time from the http request is 4.8 seconds
// export const model  = "Qwen/Qwen2.5-Coder-7B-Instruct:nscale";

// average response time from the http request is 1.6 seconds
// export const model = "openai/gpt-oss-120b:groq";

// average response time from the http request is 301 milliseconds
export const model = "moonshotai/Kimi-K2-Instruct-0905:groq";
