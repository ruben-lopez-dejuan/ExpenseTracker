import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyCategories } from '../src/lib/expense-intelligence/category-classifier.ts';

const categories = [
  { id: 'travel', name: 'Viajes', description: 'Vuelos, hoteles y transporte de vacaciones' },
  { id: 'food', name: 'Compra', description: 'Supermercado y alimentación para casa' },
  { id: 'leisure', name: 'Ocio', description: 'Cine, juegos y entretenimiento' },
];

test('category suggestions prioritize a direct category-name match', async () => {
  const result = await classifyCategories('viajes', categories, 3);
  assert.equal(result.source, 'heuristic');
  assert.equal(result.suggestions[0]?.categoryId, 'travel');
});

test('category suggestions use category descriptions without a model download', async () => {
  const result = await classifyCategories('billetes de avión y hotel', categories, 3);
  assert.equal(result.suggestions[0]?.categoryId, 'travel');
  assert.equal(result.suggestions.length > 0, true);
});
