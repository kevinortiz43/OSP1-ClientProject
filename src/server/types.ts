


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

export interface QueryResult {
  source: string;
  results: any[];
  formatted: string;
  sql: string | null;
  cached: boolean;
  cacheTime?: string;
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
  executionTime?: number | undefined;
  sqlModel?: string;
  judgeModel?: string;
};


export interface JudgmentInput {
  naturalLanguageQuery: string;
  generatedSQL: string;
  results: any[];
  resultsCount: number;
  source?: 'ai' | 'cache' | 'search';
  executionTime?: number | undefined;
  sqlModel?: string;
  judgeModel?: string;
}

export interface TriggerInput {
  naturalLanguageQuery: string;
  sqlQuery: string;
  results: any[];
  source?: string;
  executionTime?: number;
}

export interface DatabaseQueryOutput {
  rows: any[];
  error?: string;
}

export interface OfflineAIOutput {
  queryResult: QueryResult;
  databaseQuery: string | null;
  executionTime?: string;
  sqlResults: any[] | null;
}


export interface DBResult {
  // Common fields across all tables
  id?: string;
  category?: string;
  searchText?: string;
  createdAt?: Date | string;
  createdBy?: string;
  updatedAt?: Date | string;
  updatedBy?: string;
  
  // allTrustControls specific
  short?: string;
  long?: string;
  
  // allTrustFaqs specific
  question?: string;
  answer?: string;
  
  // allTeams specific
  firstName?: string;
  lastName?: string;
  role?: string;
  email?: string;
  isActive?: boolean;
  employeeId?: number;
  responseTimeHours?: number | string;  // Can be number or string from DB
  
  // Allow any other fields (for aggregations, joins, etc.)
  [key: string]: any;
}

export interface AIResponseInput {
  naturalLanguageQuery: string;
  databaseQueryResult?: DBResult[];  // For AI path (raw DB results)
  searchResults?: any[];              // For fastTextSearch path (formatted search results)
  source: 'ai' | 'search-cache' | 'search-db' | 'cache';  // possible sources
  sqlQuery?: string;         // SQL might not exist for search paths
}

export interface AIResponseOutput {
  response: string;
  found: boolean;
  source?:  'ai' | 'search-cache' | 'search-db' | 'cache'; 
  sqlQuery?: string;
  rawData?: DBResult[] | any[];
}