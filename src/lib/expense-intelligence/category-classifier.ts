import type {
  CategoryClassificationResult,
  CategoryForClassification,
} from './types';

export type {
  CategoryClassificationResult,
  CategoryForClassification,
  CategorySuggestion,
} from './types';

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyWithHeuristics(
  text: string,
  categories: CategoryForClassification[],
  limit = 3
): CategoryClassificationResult {
  const input = normalizeText(text);
  if (input.length < 2) return { suggestions: [], source: 'heuristic' };

  const inputTokens = input.split(' ').filter((token) => token.length >= 3);
  const suggestions = categories
    .map((category) => {
      const name = normalizeText(category.name);
      const description = normalizeText(category.description);
      let score = 0;

      if (name === input) score += 20;
      if (input.includes(name) || name.includes(input)) score += 10;
      for (const token of inputTokens) {
        if (name.includes(token)) score += 5;
        if (description.includes(token)) score += 2;
      }

      return { categoryId: category.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { suggestions, source: 'heuristic' };
}

export async function classifyCategories(
  text: string,
  categories: CategoryForClassification[],
  limit = 3
): Promise<CategoryClassificationResult> {
  if (!text.trim() || categories.length === 0) {
    return { suggestions: [], source: 'heuristic' };
  }
  return classifyWithHeuristics(text, categories, limit);
}
