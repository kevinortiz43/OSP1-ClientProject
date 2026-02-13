import type { RequestHandler } from "express";
import type { ServerError } from "./types";
import { AI_APIKEY } from "../../envVariables";
import { InferenceClient } from "@huggingface/inference";

import { model } from "../../envVariables";
const client = new InferenceClient(AI_APIKEY);

export const GenerateAIResponse: RequestHandler = async (_req, res, next) => {
  try {
    const { naturalLanguageQuery, databaseQueryResult } = res.locals;

    if (!databaseQueryResult || databaseQueryResult.length === 0) {
      return res.status(200).json({
        response:
          "Answer not found at this time. Please try rephrasing your question",
        found: false,
        sqlQuery: res.locals.sqlQuery,
      });
    }

    let context =
      "Relevant information from the security compliance database:\n\n";

    databaseQueryResult.forEach((result: any, index: number) => {
      if (result.short && result.long) {
        // From allTrustControls
        context += `Control ${index + 1}:\n`;
        context += `Summary: ${result.short}\n`;
        context += `Details: ${result.long}\n\n`;
      } else if (result.question && result.answer) {
        // From allTrustFaqs
        context += `FAQ ${index + 1}:\n`;
        context += `Q: ${result.question}\n`;
        context += `A: ${result.answer}\n\n`;
      }
    });

    const responsePrompt = `You are a helpful security compliance assistant. Based on the database information provided, answer the user's question in a clear, professional, and conversational manner.

INSTRUCTIONS:
1. Synthesize information from the provided controls/FAQs to directly answer the question
2. Be concise but complete aim for 2 to 4 sentences
3. Use natural language, not bullet points
4. Focus on the most relevant information or synthesize multiple items if needed
5. Don't mention that you're looking at database records - just answer naturally as if you're a knowledgeable expert
6. If the information doesn't fully answer the question, acknowledge what you can confirm based on available data

User Question: ${naturalLanguageQuery}

${context}

Provide a helpful, direct answer:`;

    const responseCompletion = await client.chatCompletion({
      model: `${model}`,
      messages: [
        {
          role: "user",
          content: responsePrompt,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const aiResponse = responseCompletion.choices[0].message.content?.trim();

    return res.status(200).json({
      response:
        aiResponse ||
        "I found relevant information but encountered an issue formulating a response. Please try again.",
      found: true,
      sources: databaseQueryResult.length,
      sqlQuery: res.locals.sqlQuery,
      // Optionally include raw data for debugging
      rawData: databaseQueryResult,
    });
  } catch (error) {
    console.error("Error generating AI response:", error);

    const serverError: ServerError = {
      log: `AI response generation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      status: 500,
      message: { err: "Failed to generate AI response" },
    };
    return next(serverError);
  }
};
