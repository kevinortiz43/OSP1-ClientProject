

export type ServerError = {
  log: string;
  status: number;
  message: { err: string };
  stack?: string; // pptional string type
};


export type TestSet = Array<{ 
  naturalLanguageQuery: string; 
  expectedResponse: any 
}>;


export interface CachedSearchResult {
  results: Array<{
    source: string;
    id: string;
    title: string;
    description: string;
    category?: string;
    searchText?: string;
  }>;
  formatted: string;
  timestamp: string;
}



export interface TextToSQLOptions {
    prompt: string;
    schemaDescription: string;
    categories?: string[];
    instructions?: string;
};


export interface Judgment {
  timestamp: Date;
  naturalLanguageQuery: string;
  // Put generated and expected SQL next to each other for comparison
  generatedSQL: string;
  expectedSQL?: string;
  // Results count comparison
  resultsCount: number;
  expectedCount?: number | string;
  // Evaluation results
  passed: boolean;
  score: number;
  explanation: string;
  // Metadata
  source: 'ai' | 'cache' | 'search';
  executionTime?: string;
  sqlModel?: string;
  judgeModel?: string;
};


interface ScoreWeights {
  semantic: number;    // Does SQL capture user intent?
  syntactic: number;   // Is SQL well-formed and valid?
  results: number;     // Are results relevant and complete?
  efficiency: number;  // Is SQL optimized? 
}