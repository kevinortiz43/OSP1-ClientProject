import "dotenv/config";

// export const { PG_URI } = process.env;

export const { PG_URI } = process.env
export const { AI_APIKEY } = process.env;

export const model  = "Qwen/Qwen2.5-Coder-7B-Instruct:nscale";


// for offline bunOllama locally-run AI branch

export const { TEXT2SQL_MODEL } = process.env;
export const { AI_RESPONSE_MODEL } = process.env;
export const { JUDGE_MODEL } = process.env;
export const { MODEL_URL } = process.env;


// TEXT2SQL_MODEL=distil-qwen3-4b:latest
// AI_RESPONSE_MODEL=qwen2.5-coder:7b
// JUDGE_MODEL=qwen2.5-coder:7b # can change to a different model as preferred (for this setup, we're keeping the AI_RESPONSE_MODEL and JUDGE_MODEL the same)
// MODEL_URL=http://ollama:11434/v1/chat/completions