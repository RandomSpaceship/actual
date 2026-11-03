import { describe, expect, it } from 'vitest';

import type {
  FormulaLibraryItemEntity,
  FormulaWidget,
  TimeFrame,
} from '#types/models';

import {
  collectFormulaLibraryForExport,
  planFormulaLibraryImport,
} from './dashboardFormulaLibrary';

const january: TimeFrame = {
  start: '2024-01-01',
  end: '2024-01-31',
  mode: 'static',
};
const february: TimeFrame = {
  start: '2024-02-01',
  end: '2024-02-29',
  mode: 'static',
};
const foodConditions = [
  { field: 'category', op: 'is', value: 'food', type: 'id' },
] as const;

function libraryQuery(
  id: string,
  name: string,
  createdAt: number,
  data: FormulaLibraryItemEntity['data'] = {},
): FormulaLibraryItemEntity {
  return { id, type: 'query', name, data, created_at: createdAt };
}

function formulaWidget(
  meta: NonNullable<FormulaWidget['meta']>,
): Pick<FormulaWidget, 'type' | 'meta'> {
  return { type: 'formula-card', meta };
}

describe('collectFormulaLibraryForExport', () => {
  it('collects the library queries that the cards use', () => {
    const library = [
      libraryQuery('food-id', 'Food', 1, { timeFrame: january }),
      libraryQuery('rent-id', 'Rent', 2),
      libraryQuery('unused-id', 'Unused', 3),
    ];

    expect(
      collectFormulaLibraryForExport(
        [
          formulaWidget({ formula: '=QUERY("food")' }),
          formulaWidget({
            formula: '=QUERY("Food")',
            colorFormula: '=IF(QUERY_COUNT("Rent")>0,"red","")',
          }),
          { type: 'markdown-card', meta: { content: 'QUERY("Unused")' } },
        ],
        library,
      ),
    ).toEqual([
      {
        id: 'food-id',
        type: 'query',
        name: 'Food',
        data: { timeFrame: january },
      },
      { id: 'rent-id', type: 'query', name: 'Rent', data: {} },
    ]);
  });

  it('skips a name that a card query hides', () => {
    expect(
      collectFormulaLibraryForExport(
        [formulaWidget({ formula: '=QUERY("food")', queries: { Food: {} } })],
        [libraryQuery('food-id', 'Food', 1)],
      ),
    ).toEqual([]);
  });

  it('collects the oldest query of a duplicate name', () => {
    expect(
      collectFormulaLibraryForExport(
        [formulaWidget({ formula: '=QUERY("food")' })],
        [libraryQuery('new-id', 'food', 2), libraryQuery('old-id', 'Food', 1)],
      ).map(({ id }) => id),
    ).toEqual(['old-id']);
  });
});

describe('planFormulaLibraryImport', () => {
  const exportedFood = {
    id: 'exported-food-id',
    type: 'query' as const,
    name: 'Food',
    data: { conditions: [...foodConditions], timeFrame: january },
  };

  function createIds() {
    let count = 0;
    return () => `new-id-${++count}`;
  }

  it('creates a library query for a new name and moves the card time frame to its id', () => {
    const plan = planFormulaLibraryImport(
      [
        formulaWidget({
          formula: '=QUERY("food")',
          timeFrameOverrides: {
            'exported-food-id': { name: 'Food', timeFrame: february },
            'unknown-id': { name: 'Other', timeFrame: february },
          },
        }),
      ],
      [exportedFood],
      [],
      createIds(),
    );

    expect(plan.itemsToCreate).toEqual([{ ...exportedFood, id: 'new-id-1' }]);
    expect(plan.widgets[0].meta).toEqual({
      formula: '=QUERY("food")',
      timeFrameOverrides: {
        'new-id-1': { name: 'Food', timeFrame: february },
      },
    });
  });

  it('uses an identical library query with the same name', () => {
    const plan = planFormulaLibraryImport(
      [
        formulaWidget({
          formula: '=QUERY("food")',
          timeFrameOverrides: {
            'exported-food-id': { name: 'Food', timeFrame: february },
          },
        }),
      ],
      [exportedFood],
      [
        libraryQuery('local-food-id', 'food', 1, {
          conditions: [...foodConditions],
          conditionsOp: 'and',
          timeFrame: january,
          description: 'A different description',
        }),
      ],
      createIds(),
    );

    expect(plan.itemsToCreate).toEqual([]);
    expect(plan.widgets[0].meta).toEqual({
      formula: '=QUERY("food")',
      timeFrameOverrides: {
        'local-food-id': { name: 'Food', timeFrame: february },
      },
    });
  });

  it('copies the query into the card when a different library query has the name', () => {
    const plan = planFormulaLibraryImport(
      [
        formulaWidget({
          formula: '=QUERY("food")',
          timeFrameOverrides: {
            'exported-food-id': { name: 'Food', timeFrame: february },
          },
        }),
        formulaWidget({ formula: '=QUERY("Food")' }),
        formulaWidget({ formula: '=1' }),
      ],
      [exportedFood],
      [libraryQuery('local-food-id', 'Food', 1, { timeFrame: february })],
      createIds(),
    );

    expect(plan.itemsToCreate).toEqual([]);
    expect(plan.widgets.map(({ meta }) => meta)).toEqual([
      {
        formula: '=QUERY("food")',
        queries: {
          Food: {
            conditions: foodConditions,
            conditionsOp: 'and',
            timeFrame: february,
          },
        },
        timeFrameOverrides: {},
      },
      {
        formula: '=QUERY("Food")',
        queries: {
          Food: {
            conditions: foodConditions,
            conditionsOp: 'and',
            timeFrame: january,
          },
        },
      },
      { formula: '=1' },
    ]);
  });

  it('fills a partial library time frame when it copies the query into the card', () => {
    const plan = planFormulaLibraryImport(
      [formulaWidget({ formula: '=QUERY("food")' })],
      [{ ...exportedFood, data: { timeFrame: { mode: 'full' } } }],
      [libraryQuery('local-food-id', 'Food', 1)],
      createIds(),
    );

    expect(plan.widgets[0].meta?.queries?.Food.timeFrame).toEqual({
      start: expect.any(String),
      end: expect.any(String),
      mode: 'full',
    });
  });

  it('leaves other widgets unchanged', () => {
    const widget = { type: 'markdown-card', meta: { content: 'text' } };
    expect(
      planFormulaLibraryImport([widget], [exportedFood], [], createIds())
        .widgets[0],
    ).toBe(widget);
  });
});
