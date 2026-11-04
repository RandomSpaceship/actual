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

describe('providers in a dashboard export and import', () => {
  function libraryProvider(
    id: string,
    name: string,
    formula: string,
    createdAt = 0,
  ): FormulaLibraryItemEntity {
    return {
      id,
      type: 'provider',
      name,
      data: { formula },
      created_at: createdAt,
    };
  }

  function exportedProvider(name: string, formula: string) {
    return {
      id: `exported-${name}`,
      type: 'provider' as const,
      name,
      data: { formula },
    };
  }

  function createIds() {
    let count = 0;
    return () => `new-id-${++count}`;
  }

  it('exports the providers that a card uses, and the queries that they use', () => {
    const library = [
      libraryQuery('food-id', 'Food', 1),
      libraryQuery('rent-id', 'Rent', 2),
      libraryProvider('net-id', 'Net', '=Spending * 2'),
      libraryProvider(
        'spending-id',
        'Spending',
        '=QUERY("food") + QUERY("rent")',
      ),
      libraryProvider('unused-id', 'Unused', '=1'),
    ];

    expect(
      collectFormulaLibraryForExport(
        [formulaWidget({ formula: '=net', queries: { rent: {} } })],
        library,
      ).map(({ id }) => id),
    ).toEqual(['food-id', 'net-id', 'spending-id']);
  });

  it('exports what the card providers use, and not the names that they hide', () => {
    const library = [
      libraryQuery('food-id', 'Food', 1),
      libraryProvider('net-id', 'Net', '=Base * 2'),
      libraryProvider('base-id', 'Base', '=QUERY("rent")'),
      libraryProvider('yearly-id', 'Yearly', '=1'),
    ];

    expect(
      collectFormulaLibraryForExport(
        [
          formulaWidget({
            formula: '=Yearly',
            providers: {
              YEARLY: { formula: '=Net * 12' },
              base: { formula: '=QUERY("food")' },
            },
          }),
        ],
        library,
      ).map(({ id }) => id),
    ).toEqual(['food-id', 'net-id']);
  });

  it('renames an imported provider in card providers, but not a name that a card provider hides', () => {
    const plan = planFormulaLibraryImport(
      [
        formulaWidget({
          formula: '=Yearly + Hidden',
          providers: {
            Yearly: { formula: '=Net * 12', description: 'Per year' },
            HIDDEN: { formula: '=Net' },
          },
        }),
      ],
      [exportedProvider('Net', '=1'), exportedProvider('Hidden', '=2')],
      [
        libraryProvider('net-id', 'Net', '=2'),
        libraryProvider('hidden-id', 'Hidden', '=3'),
      ],
      createIds(),
    );

    expect(plan.widgets[0].meta).toMatchObject({
      formula: '=Yearly + Hidden',
      providers: {
        Yearly: { formula: '=Net_2 * 12', description: 'Per year' },
        HIDDEN: { formula: '=Net_2' },
      },
    });
  });

  it('reuses an identical provider and creates a new one', () => {
    const plan = planFormulaLibraryImport(
      [formulaWidget({ formula: '=Net + Other' })],
      [exportedProvider('Net', '=1'), exportedProvider('Other', '=2')],
      [libraryProvider('net-id', 'NET', '=1')],
      createIds(),
    );

    expect(plan.itemsToCreate).toEqual([
      { ...exportedProvider('Other', '=2'), id: 'new-id-1' },
    ]);
    expect(plan.widgets[0].meta?.formula).toBe('=Net + Other');
  });

  it('gives a different provider with the same name a new name in the imported formulas', () => {
    const plan = planFormulaLibraryImport(
      [
        formulaWidget({
          formula: '=Yearly / Net',
          colorFormula: '=IF(Net > 0, "red", "")',
        }),
      ],
      [exportedProvider('Yearly', '=Net * 12'), exportedProvider('Net', '=1')],
      [
        libraryProvider('net-id', 'Net', '=2'),
        libraryProvider('net-2-id', 'Net_2', '=3'),
        // The same text as the export, but its Net is a different provider
        libraryProvider('yearly-id', 'Yearly', '=Net * 12'),
      ],
      createIds(),
    );

    expect(plan.itemsToCreate).toEqual([
      { ...exportedProvider('Net', '=1'), id: 'new-id-1', name: 'Net_3' },
      {
        ...exportedProvider('Yearly', '=Net_3 * 12'),
        id: 'new-id-2',
        name: 'Yearly_2',
      },
    ]);
    expect(plan.widgets[0].meta).toMatchObject({
      formula: '=Yearly_2 / Net_3',
      colorFormula: '=IF(Net_3 > 0, "red", "")',
    });
  });

  it('copies a query into the card when only a provider of the card uses it', () => {
    const plan = planFormulaLibraryImport(
      [formulaWidget({ formula: '=Doubled' })],
      [
        exportedProvider('Doubled', '=QUERY("food") * 2'),
        {
          id: 'exported-food-id',
          type: 'query',
          name: 'Food',
          data: { timeFrame: january },
        },
      ],
      [libraryQuery('local-food-id', 'food', 1, { timeFrame: february })],
      createIds(),
    );

    expect(plan.widgets[0].meta?.queries).toEqual({
      Food: { conditions: [], conditionsOp: 'and', timeFrame: january },
    });
  });
});
