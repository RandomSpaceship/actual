import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import { listQueryNames, resolveQuery } from './resolveQuery';
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
    expect(
      resolveQuery('food', { localQueries: { food }, library: [] }),
    ).toEqual({
      query: { name: 'food', source: 'local', config: food },
      issues: [],
    });
  });

  it('ignores case in names', () => {
    const { query, issues } = resolveQuery('FOOD', {
      localQueries: { food },
      library: [],
    });

    expect(query?.name).toBe('food');
    expect(issues).toEqual([]);
  });

  it('prefers an exact match to a match that ignores case', () => {
    const localQueries = { food, FOOD: foodUpperCase };

    expect(
      resolveQuery('food', { localQueries, library: [] }).query?.config,
    ).toBe(food);
    expect(
      resolveQuery('FOOD', { localQueries, library: [] }).query?.config,
    ).toBe(foodUpperCase);
  });

  it('gives a missing-query error for an unknown name', () => {
    expect(
      resolveQuery('rent', { localQueries: { food }, library: [] }),
    ).toEqual({
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

    describe('card time frame overrides', () => {
      const lastYear = {
        start: '2025-01-01',
        end: '2025-12-31',
        mode: 'lastYear',
      } as const;

      it('uses the override instead of the library time frame', () => {
        const { query, issues } = resolveQuery('food', {
          localQueries: {},
          library: [libraryFood],
          timeFrameOverrides: {
            'library-food': { name: 'Food', timeFrame: lastYear },
          },
        });

        expect(query?.config).toEqual({ ...food, timeFrame: lastYear });
        expect(issues).toEqual([]);
      });

      it('keeps the override after a rename of the library query', () => {
        const { query } = resolveQuery('Groceries', {
          localQueries: {},
          library: [libraryQuery('library-food', 'Groceries', food)],
          timeFrameOverrides: {
            'library-food': { name: 'Food', timeFrame: lastYear },
          },
        });

        expect(query?.config.timeFrame).toEqual(lastYear);
      });

      it('ignores an override for a different library query, with a warning', () => {
        const { query, issues } = resolveQuery('food', {
          localQueries: {},
          library: [libraryFood],
          timeFrameOverrides: {
            'deleted-food': { name: 'food', timeFrame: lastYear },
          },
        });

        expect(query?.config.timeFrame).toEqual(food.timeFrame);
        expect(issues).toMatchObject([
          { severity: 'warning', kind: 'stale-override', name: 'food' },
        ]);
      });

      it('does not apply an override to a card query', () => {
        const { query } = resolveQuery('food', {
          localQueries: { food },
          library: [libraryFood],
          timeFrameOverrides: {
            'library-food': { name: 'Food', timeFrame: lastYear },
          },
        });

        expect(query?.config).toBe(food);
      });

      it('warns about an override for an AQL query without a date field', () => {
        const aqlItem = (dateField?: string | null) => ({
          id: 'library-aql',
          type: 'aql-query' as const,
          name: 'payees',
          data: { aql: '{"table": "payees"}', dateField },
          created_at: 0,
        });
        const timeFrameOverrides = {
          'library-aql': { name: 'payees', timeFrame: lastYear },
        };

        const { query, issues } = resolveQuery('payees', {
          localQueries: {},
          library: [aqlItem()],
          timeFrameOverrides,
        });
        expect(query?.config).toEqual({
          aql: { text: '{"table": "payees"}', dateField: undefined },
          timeFrame: lastYear,
        });
        expect(issues).toMatchObject([
          { severity: 'warning', kind: 'stale-override', name: 'payees' },
        ]);
        expect(
          resolveQuery('payees', {
            localQueries: {},
            library: [aqlItem('next_date')],
            timeFrameOverrides,
          }).issues,
        ).toEqual([]);
      });
    });

    it('lists card names, then library names that no card query hides', () => {
      expect(
        listQueryNames({
          localQueries: { food: foodUpperCase, rent: food },
          library: [
            libraryFood,
            libraryQuery('salary', 'Salary', food),
            libraryQuery('newer-salary', 'salary', food),
          ],
        }),
      ).toEqual({ food: 'local', rent: 'local', Salary: 'library' });
    });
  });
});
