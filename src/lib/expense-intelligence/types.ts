export type CategoryForClassification = {
  id: string;
  name: string;
  description: string;
};

export type CategorySuggestion = {
  categoryId: string;
  score: number;
};

export type CategoryClassificationResult = {
  suggestions: CategorySuggestion[];
  source: 'e5' | 'heuristic';
};
