import type { RequestHandler } from "express";
import type { ServerError } from "./types";
import "dotenv/config";


const schema:
'You are a SQL expert. Convert natural language queries into valid PostgreSQL SELECT statements. Only respond with the SQL query, no explanations or markdown formatting.'