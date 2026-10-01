import {
  cosineSimilarity,
  createE5Embedding,
} from './e5-engine';

import type {
  CategoryClassificationResult,
  CategoryForClassification,
} from './types';

type CachedCategory = {
  fingerprint: string;
  embedding: number[];
};

const categoryEmbeddingCache =
  new Map<
    string,
    CachedCategory
  >();

let cacheHits = 0;
let cacheMisses = 0;

function categoryFingerprint(
  category: CategoryForClassification
) {
  return JSON.stringify([
    category.id,
    category.name,
    category.description,
  ]);
}

async function getCategoryEmbedding(
  category: CategoryForClassification
) {
  const fingerprint =
    categoryFingerprint(category);

  const cached =
    categoryEmbeddingCache.get(
      category.id
    );

  if (
    cached &&
    cached.fingerprint ===
      fingerprint
  ) {
    cacheHits++;
    return cached.embedding;
  }

  cacheMisses++;

  const embedding =
    await createE5Embedding(
      `passage: ${category.name}. ${category.description}`
    );

  categoryEmbeddingCache.set(
    category.id,
    {
      fingerprint,
      embedding,
    }
  );

  return embedding;
}

function removeDeletedCategories(
  categories:
    CategoryForClassification[]
) {
  const activeIds =
    new Set(
      categories.map(
        (category) =>
          category.id
      )
    );

  for (
    const categoryId
    of categoryEmbeddingCache.keys()
  ) {
    if (
      !activeIds.has(categoryId)
    ) {
      categoryEmbeddingCache.delete(
        categoryId
      );
    }
  }
}

export async function classifyCategoriesWithE5(
  text: string,
  categories:
    CategoryForClassification[],
  limit = 3
): Promise<CategoryClassificationResult> {
  if (
    !text.trim() ||
    categories.length === 0
  ) {
    return {
      suggestions: [],
      source: 'e5',
    };
  }

  removeDeletedCategories(
    categories
  );

  const queryEmbedding =
    await createE5Embedding(
      `query: ${text.trim()}`
    );

  const categoryEmbeddings =
    await Promise.all(
      categories.map(
        async (category) => ({
          category,
          embedding:
            await getCategoryEmbedding(
              category
            ),
        })
      )
    );

  const suggestions =
    categoryEmbeddings
      .map(
        ({
          category,
          embedding,
        }) => ({
          categoryId:
            category.id,
          score:
            cosineSimilarity(
              queryEmbedding,
              embedding
            ),
        })
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, limit);

  if (__DEV__) {
    console.log(
      `[E5] categorías: ${categories.length} | cache hits: ${cacheHits} | misses: ${cacheMisses}`
    );

    console.log(
      '[E5] Top-3:',
      suggestions.map((item) => ({
        categoryId: item.categoryId,
        score: Number(
          item.score.toFixed(4)
        ),
      }))
    );
  }

  return {
    suggestions,
    source: 'e5',
  };
}

export function clearE5CategoryCache() {
  categoryEmbeddingCache.clear();
}
