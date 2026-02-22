import { AI_APIKEY, model } from '../../envVariables';
import { InferenceClient } from '@huggingface/inference';

const client = new InferenceClient(AI_APIKEY);

interface DBResult {
  short?: string;
  long?: string;
  question?: string;
  answer?: string;
}

interface AIResponseInput {
  naturalLanguageQuery: string;
  databaseQueryResult: DBResult[];
  sqlQuery: string;
}

interface AIResponseOutput {
  response: string;
  found: boolean;
  sources?: number;
  sqlQuery: string;
  rawData?: DBResult[];
}

export async function generateAIResponse({
  naturalLanguageQuery,
  databaseQueryResult,
  sqlQuery,
}: AIResponseInput): Promise<AIResponseOutput> {

  if (!databaseQueryResult || databaseQueryResult.length === 0) {
    return {
      response: 'Answer not found at this time. Please try rephrasing your question',
      found: false,
      sqlQuery,
    };
  }

  let context = 'Relevant information from the security compliance database:\n\n';

  databaseQueryResult.forEach((result, index) => {
    if (result.short && result.long) {
      context += `Control ${index + 1}:\n`;
      context += `Summary: ${result.short}\n`;
      context += `Details: ${result.long}\n\n`;
    } else if (result.question && result.answer) {
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

  try {
    const responseCompletion = await client.chatCompletion({
      model,
      messages: [{ role: 'user', content: responsePrompt }],
      max_tokens: 300,
      temperature: 0.7,
    });

    const aiResponse = responseCompletion.choices[0].message.content?.trim();

    return {
      response: aiResponse || 'I found relevant information but encountered an issue formulating a response. Please try again.',
      found: true,
      sources: databaseQueryResult.length,
      sqlQuery,
      rawData: databaseQueryResult,
    };

  } catch (error) {
    console.error('Error generating AI response:', error);
    throw new Error(`AI response generation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}