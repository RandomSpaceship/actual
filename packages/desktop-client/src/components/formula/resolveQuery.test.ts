import { describe, expect, it } from 'vitest';

import { resolveQuery } from './resolveQuery';
import type { FormulaQueryConfig } from './resolveQuery';
import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';

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
    expect(resolveQuery('food', { localQueries: { food }, library: [] })).toEqual({
      query: { name: 'food', source: 'local', config: food },
      issues: [],
    });
  });

  it('ignores case in names', () => {
    const { query, issues } = resolveQuery('FOOD', { localQueries: { food }, library: [] });

    expect(query?.name).toBe('food');
    expect(issues).toEqual([]);
  });

  it('prefers an exact match to a match that ignores case', () => {
    const localQueries = { food, FOOD: foodUpperCase };

    expect(resolveQuery('food', { localQueries, library: [] }).query?.config).toBe(food);
    expect(resolveQuery('FOOD', { localQueries, library: [] }).query?.config).toBe(
      foodUpperCase,
    );
  });

  it('gives a missing-query error for an unknown name', () => {
    expect(resolveQuery('rent', { localQueries: { food }, library: [] })).toEqual({
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
      resolveQuery('toString', { localQueries: { food }, library: [] }).query,
    ).toBeNull();
  });

  describe('library queries', () => {
    function libraryQuery(
      id: string,
      name: string,
      config: FormulaQueryConfig,
    ): FormulaLibraryQueryEntity {
      return {
        id,
        type: 'query',
        name,
        data: { description: 'Not part of the config', ...config },
        created_at: 0,
      };
    }

    const libraryFood = libraryQuery('library-food', 'Food', food);

    it('resolves a library query when no card query has the name', () => {
      expect(
        resolveQuery('food', { localQueries: {}, library: [libraryFood] }),
      ).toEqual({
        query: {
          name: 'Food',
          source: 'library',
          libraryId: 'library-food',
          config: food,
        },
        issues: [],
      });
    });

    it('uses a card query with the same name, with a warning', () => {
      const { query, issues } = resolveQuery('food', {
        localQueries: { food: foodUpperCase },
        library: [libraryFood],
      });

      expect(query).toMatchObject({ source: 'local', config: foodUpperCase });
      expect(issues).toMatchObject([
        { severity: 'warning', kind: 'shadowed', name: 'food' },
      ]);
    });

    it('uses the oldest of two library queries with the same name, with a warning', () => {
      const { query, issues } = resolveQuery('food', {
        localQueries: {},
        library: [libraryFood, libraryQuery('newer', 'food', foodUpperCase)],
      });

      expect(query?.libraryId).toBe('library-food');
      expect(issues).toMatchObject([
        { severity: 'warning', kind: 'duplicate-name', name: 'food' },
      ]);
    });
  });
});
