import { type AIResponseInput, type AIResponseOutput} from "../types"

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
2. Be concise but complete - aim for 2 to 4 sentences
3. Use natural language, not bullet points
4. Focus on the most relevant information
5. Don't mention that you're looking at database records or search results - just answer naturally
6. If the information doesn't fully answer the question, acknowledge what you can confirm

User Question: ${naturalLanguageQuery}

${context}

Provide a helpful, direct answer:`;

  try {
    const response = await fetch(modelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: responsePrompt }],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    console.log('Ollama response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ollama error response:', errorText);
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    console.log('Ollama response received');
    
    const aiResponse = responseData.choices?.[0]?.message?.content?.trim();

    return {
      response: aiResponse || 'I found relevant information but encountered an issue formulating a response. Please try again.',
      found: true,
      source,  
      sqlQuery,
      rawData: data,
    };

  } catch (error) {
    console.error('Error generating AI response:', error);

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
}