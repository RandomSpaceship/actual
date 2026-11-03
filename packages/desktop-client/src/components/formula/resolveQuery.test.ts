import { describe, expect, it } from 'vitest';

import { resolveQuery } from './resolveQuery';
import type { FormulaQueryConfig } from './resolveQuery';

const food: FormulaQueryConfig = {
  conditions: [{ field: 'category', op: 'is', value: 'food', type: 'id' }],
  conditionsOp: 'and',
  timeFrame: { start: '2024-01-01', end: '2024-03-31', mode: 'static' },
};

const foodUpperCase: FormulaQueryConfig = {
  conditions: [{ field: 'category', op: 'is', value: 'other', type: 'id' }],
};

describe('resolveQuery', () => {
  it('resolves a local query with its own time frame', () => {
    expect(resolveQuery('food', { localQueries: { food } })).toEqual({
      query: { name: 'food', source: 'local', config: food },
      issues: [],
    });
  });

  it('ignores case in names', () => {
    const { query, issues } = resolveQuery('FOOD', { localQueries: { food } });

    expect(query?.name).toBe('food');
    expect(issues).toEqual([]);
  });

  it('prefers an exact match to a match that ignores case', () => {
    const localQueries = { food, FOOD: foodUpperCase };

    expect(resolveQuery('food', { localQueries }).query?.config).toBe(food);
    expect(resolveQuery('FOOD', { localQueries }).query?.config).toBe(
      foodUpperCase,
    );
  });

  it('gives a missing-query error for an unknown name', () => {
    expect(resolveQuery('rent', { localQueries: { food } })).toEqual({
      query: null,
      issues: [
        {
          severity: 'error',
          kind: 'missing-query',
          name: 'rent',
          message: 'Query "rent" not found',
        },
      ],
    });
  });

  it('does not resolve names from the object prototype', () => {
    expect(
      resolveQuery('toString', { localQueries: { food } }).query,
    ).toBeNull();
  });
});
