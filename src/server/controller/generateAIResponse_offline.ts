import { type AIResponseInput, type AIResponseOutput } from "../types"

const modelUrl = process.env.MODEL_URL || 'http://ollama:11434/v1/chat/completions';
const modelName = process.env.AI_RESPONSE_MODEL || 'qwen2.5-coder:7b';

export async function generateAIResponse({
  naturalLanguageQuery,
  databaseQueryResult,
  searchResults,
  source,
  sqlQuery = '',
}: AIResponseInput): Promise<AIResponseOutput> {

  // Determine which data to use
  const data = databaseQueryResult || searchResults || [];

  if (!data || data.length === 0) {
    return {
      response: 'Answer not found at this time. Please try rephrasing your question',
      found: false,
      source,
      sqlQuery,
    };
  }

  // Build context with source information
  let context = '';

  if (source === 'ai') {
    context = 'Database query results (raw data):\n' + JSON.stringify(data, null, 2);
  } else {
    // For search paths, we have formatted results with titles/descriptions
    // We can do the same for other fields (not everything is added in here. Hard-coding acts more like placeholder for better code to dynamically retrieve fields)
    context = 'Search results from knowledge base:\n\n';
    data.forEach((item, index) => {
      if (item.title && item.description) {
        context += `Result ${index + 1}:\n`;
        context += `Title: ${item.title}\n`;
        context += `Description: ${item.description}\n`;
        if (item.category) context += `Category: ${item.category}\n`;
        context += '\n';
      } else {
        // Fallback to JSON if structure is unknown
        context += `Result ${index + 1}:\n${JSON.stringify(item, null, 2)}\n\n`;
      }
    });
  }

  const responsePrompt = `You are a helpful security compliance assistant. Based on the information provided, answer the user's question in a clear, professional, and conversational manner.

INSTRUCTIONS:
1. Synthesize information from the provided data to directly answer the question
2. DO NOT repeat or paraphrase the user's question in your response
3. DO NOT start with phrases like "Based on the data..." or "According to the results..."
4. DO NOT use introductory phrases like "Here is what I found..." or "The answer to your question is..."
5. Start your response DIRECTLY with the answer
6. Be concise but complete - aim for 2 to 4 sentences
7. Use natural language, not bullet points
8. Focus on the most relevant information
9. Don't mention that you're looking at database records or search results - just answer naturally
10. If the information doesn't fully answer the question, acknowledge what you can confirm

EXAMPLES:

Good response (for "who handles security?"):
"Sarah Chen (sarah.chen@company.com) is the Security Lead. The team also includes Michael Park (Security Analyst) and Jessica Wong (Security Engineer)."

Bad response (DO NOT DO THIS):
"Based on your question about who handles security, I looked at the data and found that Sarah Chen..."

Good response (for "what's the refund policy?"):
"Refunds are processed within 5-7 business days. For premium customers, refunds are immediate. Contact billing@company.com for assistance."

Bad response (DO NOT DO THIS):
"You asked about the refund policy. According to our database, the refund policy states that..."

User Question: ${naturalLanguageQuery}

${context}

Provide a helpful, direct answer:`;

  // Retry logic 
  const maxRetries = 3;
  let lastError: Error | null = null;
  let delay = 100; // Start with 100ms delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} to call Ollama...`);

      const response = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: responsePrompt }],
          temperature: 0.2, // more deterministic (can increase value to be more 'creative')
          max_tokens: 800, // max length of how long you want the generated response to be
          stop: []  
        })
      });

      console.log('Ollama response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Ollama error response (attempt ${attempt}):`, errorText);
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const responseData = await response.json();
      console.log('Ollama response received');

      let aiResponse = responseData.choices?.[0]?.message?.content?.trim();

      // Check if we got a valid response
      if (!aiResponse) {
        throw new Error('Empty response from model');
      }

      // Clean any special tokens
      aiResponse = aiResponse
        .replace(/<\|im_start\|>/g, '')
        .replace(/<\|im_end\|>/g, '')
        .replace(/<\|[^|]+\|>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Success - Return the response
      return {
        response: aiResponse,
        found: true,
        source,
        sqlQuery,
        rawData: data,
      };

    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff: 100ms, 200ms, 400ms
      }
    }
  }

  // If we get here, all retries failed
  console.error('All retries failed. Last error:', lastError);

  // Generic fallback
  const fallbackResponse = data
    .map((item) => {
      // For search results with title/description
      if (item.title && item.description) {
        return `${item.title}: ${item.description}`;
      }
      // For any other structure
      return Object.entries(item)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    })
    .join('\n\n');

  return {
    response: fallbackResponse || 'No results found.',
    found: true,
    source,
    sqlQuery,
    rawData: data,
  };
}