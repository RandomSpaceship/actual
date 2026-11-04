import { send } from '@actual-app/core/platform/client/connection';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeFormula } from './executeFormula';
import {
  getCellsTransactionsFilter,
  getCellTransactionsFilter,
  getColumnTransactionsFilter,
  getRowTransactionsFilter,
} from './formulaSourceMap';
import { resolveQuery } from './resolveQuery';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

const localQueries = {
  all: {},
  firstQuarter: {
    timeFrame: { start: '2024-01', end: '2024-03', mode: 'static' as const },
  },
};

const categoryGroups = [
  {
    id: 'bills',
    name: 'Bills',
    categories: [
      { id: 'rent', name: 'Rent' },
      { id: 'power', name: 'Power' },
    ],
  },
  {
    id: 'food',
    name: 'Food',
    categories: [{ id: 'groceries', name: 'Groceries' }],
  },
];

type GroupedQuery = {
  groupExpressions: unknown[];
  selectExpressions: Array<Record<string, unknown>>;
};

// The rows that the database gives for each group expression list. Sums are
// integers.
function groupedRows({ groupExpressions, selectExpressions }: GroupedQuery) {
  const isCount = JSON.stringify(selectExpressions).includes('$count');
  const groups = JSON.stringify(groupExpressions);
  if (groups === JSON.stringify([{ $id: '$category' }])) {
    return [
      { key0: 'power', value: isCount ? 2 : -5000 },
      { key0: 'groceries', value: isCount ? 4 : -12000 },
      { key0: null, value: isCount ? 1 : 300 },
    ];
  }
  if (groups === JSON.stringify([{ $month: '$date' }])) {
    return [
      { key0: '2024-01', value: -1000 },
      { key0: '2024-03', value: -2000 },
    ];
  }
  if (groups === JSON.stringify([{ $id: '$category' }, { $month: '$date' }])) {
    return [
      { key0: 'power', key1: '2024-01', value: isCount ? 1 : -1000 },
      { key0: 'groceries', key1: '2024-02', value: isCount ? 3 : -3000 },
    ];
  }
  if (
    groups ===
    JSON.stringify([{ $id: '$category.group' }, { $id: '$category' }])
  ) {
    return [
      { key0: 'bills', key1: 'rent', value: -2000 },
      { key0: 'bills', key1: 'power', value: -5000 },
      { key0: 'food', key1: 'groceries', value: -12000 },
    ];
  }
  if (groups === JSON.stringify([{ $day: '$date' }])) {
    // A Monday and a Wednesday, then the Tuesday after
    return [
      { key0: '2024-01-01', value: -500 },
      { key0: '2024-01-03', value: -700 },
      { key0: '2024-01-09', value: -100 },
    ];
  }
  if (groups === JSON.stringify([{ $id: '$category' }, { $day: '$date' }])) {
    return [{ key0: 'power', key1: '2024-01-01', value: -500 }];
  }
  if (groups === JSON.stringify([{ $id: '$payee' }])) {
    return [
      { key0: 'transfer-payee', value: 700 },
      { key0: 'shop', value: -100 },
    ];
  }
  throw new Error(`No rows for ${groups}`);
}

function run(formula: string, output: 'value' | 'table' = 'table') {
  return executeFormula({
    formula,
    resolveQuery: name => resolveQuery(name, { localQueries, library: [] }),
    accounts: [],
    library: [],
    language: 'en-US',
    output,
  });
}

beforeEach(() => {
  vi.mocked(send).mockImplementation((async (name: string, query: unknown) => {
    if (name === 'make-filters-from-conditions') return { filters: [] };
    if (name === 'get-categories') return { grouped: categoryGroups };
    if (name === 'accounts-get') {
      return [
        { id: 'savings', name: 'Savings', closed: false, offbudget: false },
      ];
    }
    if (name === 'payees-get') {
      return [
        { id: 'shop', name: 'Shop' },
        { id: 'transfer-payee', name: '', transfer_acct: 'savings' },
      ];
    }
    if (name === 'query') {
      return { data: groupedRows(query as GroupedQuery) };
    }
    return undefined;
  }) as unknown as typeof send);
});

describe('QUERY_GROUP', () => {
  it('gives a row for each category in budget order', async () => {
    expect((await run('=QUERY_GROUP("all", "category")')).table).toEqual([
      ['Power', -50],
      ['Groceries', -120],
      ['Uncategorized', 3],
    ]);
  });

  it('sorts by name or by value', async () => {
    expect(
      (await run('=QUERY_GROUP("all", "category", "name")')).table,
    ).toEqual([
      ['Groceries', -120],
      ['Power', -50],
      ['Uncategorized', 3],
    ]);
    expect((await run('=QUERY_GROUP("all", "Category", "ASC")')).table).toEqual(
      [
        ['Groceries', -120],
        ['Power', -50],
        ['Uncategorized', 3],
      ],
    );
  });

  it('gives a zero row for a month without transactions', async () => {
    expect((await run('=QUERY_GROUP("firstQuarter", "month")')).table).toEqual([
      ['2024-01', -10],
      ['2024-02', 0],
      ['2024-03', -20],
    ]);
  });

  it('keeps the rows of a group together with two dimensions', async () => {
    expect(
      (await run('=QUERY_GROUP("firstQuarter", "category", "asc", "month")'))
        .table,
    ).toEqual([
      ['Groceries', '2024-01', 0],
      ['Groceries', '2024-02', -30],
      ['Groceries', '2024-03', 0],
      ['Power', '2024-01', -10],
      ['Power', '2024-02', 0],
      ['Power', '2024-03', 0],
    ]);
  });

  it('sorts inside each group with sort 2', async () => {
    const groupFormula = (sort1: string, sort2: string) =>
      `=QUERY_GROUP("all", "category group", ${sort1}, "category", ${sort2})`;
    // Without sort 2, desc sorts both the groups and the rows in them
    expect((await run(groupFormula('"desc"', ''))).table).toEqual([
      ['Bills', 'Rent', -20],
      ['Bills', 'Power', -50],
      ['Food', 'Groceries', -120],
    ]);
    expect((await run(groupFormula('"asc"', '"name"'))).table).toEqual([
      ['Food', 'Groceries', -120],
      ['Bills', 'Power', -50],
      ['Bills', 'Rent', -20],
    ]);
    expect((await run(groupFormula('', '"asc"'))).table).toEqual([
      ['Bills', 'Power', -50],
      ['Bills', 'Rent', -20],
      ['Food', 'Groceries', -120],
    ]);
  });

  it('sorts the periods in a group by value only with sort 2', async () => {
    expect(
      (
        await run(
          '=QUERY_GROUP("firstQuarter", "category", "desc", "month", "asc")',
        )
      ).table,
    ).toEqual([
      ['Power', '2024-01', -10],
      ['Power', '2024-02', 0],
      ['Power', '2024-03', 0],
      ['Groceries', '2024-02', -30],
      ['Groceries', '2024-01', 0],
      ['Groceries', '2024-03', 0],
    ]);
  });

  it('gives an error for a bad sort 2', async () => {
    await expect(
      run('=QUERY_GROUP("all", "category", , , "asc")'),
    ).rejects.toThrow('Give dimension 2 before its sort');
    await expect(
      run('=QUERY_GROUP("all", "category group", , "category", "up")'),
    ).rejects.toThrow('Unknown sort "up"');
  });

  it('gives a row for each day, week or quarter', async () => {
    const days = (await run('=QUERY_GROUP("all", "day")')).table;
    expect(days).toHaveLength(9);
    expect(days?.slice(0, 3)).toEqual([
      ['2024-01-01', -5],
      ['2024-01-02', 0],
      ['2024-01-03', -7],
    ]);
    // The week starts on Sunday when the preference is not set
    expect((await run('=QUERY_GROUP("all", "week")')).table).toEqual([
      ['2023-12-31', -12],
      ['2024-01-07', -1],
    ]);
    expect(
      (await run('=QUERY_GROUP("firstQuarter", "quarter")')).table,
    ).toEqual([["Q1 '24", -30]]);
  });

  it('starts the week on the day that the preference gives', async () => {
    const mockedSend = vi.mocked(send).getMockImplementation();
    vi.mocked(send).mockImplementation((async (name: string, query: unknown) =>
      name === 'preferences/get'
        ? { firstDayOfWeekIdx: '1' }
        : mockedSend?.(
            name as never,
            query as never,
          )) as unknown as typeof send);
    expect((await run('=QUERY_GROUP("all", "week")')).table).toEqual([
      ['2024-01-01', -12],
      ['2024-01-08', -1],
    ]);
  });

  it('gives a warning for a table with more than 50 rows', async () => {
    const result = await run('=QUERY_GROUP("firstQuarter", "day")');

    expect(result.table).toHaveLength(91);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'warning', kind: 'large-table' }),
    ]);
  });

  it('gives a transfer payee the name of its account', async () => {
    expect((await run('=QUERY_GROUP("all", "payee")')).table).toEqual([
      ['Savings', 7],
      ['Shop', -1],
    ]);
  });

  it('gives counts for QUERY_GROUP_COUNT', async () => {
    expect((await run('=QUERY_GROUP_COUNT("all", "category")')).table).toEqual([
      ['Power', 2],
      ['Groceries', 4],
      ['Uncategorized', 1],
    ]);
  });

  it('works inside other functions', async () => {
    expect(
      await run('=INDEX(QUERY_GROUP("all", "category"), 2, 2)', 'value'),
    ).toEqual({ value: -120, issues: [] });
    expect(
      await run('=SUM(QUERY_GROUP_COUNT("all", "category"))', 'value'),
    ).toEqual({ value: 7, issues: [] });
  });

  it('gives an error for an unknown dimension', async () => {
    await expect(run('=QUERY_GROUP("all", "colour")')).rejects.toThrow(
      'Unknown dimension "colour"',
    );
  });

  it('gives an error for an argument that is not text in the formula', async () => {
    await expect(run('=QUERY_GROUP("all", LOWER("CATEGORY"))')).rejects.toThrow(
      'The arguments of QUERY_GROUP must be text in the formula',
    );
  });

  it('gives an error for an unknown query', async () => {
    const result = await run('=QUERY_GROUP("missing", "category")');

    expect(result.value).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'missing-query' }),
    ]);
  });
});

describe('QUERY_PIVOT', () => {
  it('gives a header row with the dimension names and a column for each month', async () => {
    expect(
      (await run('=QUERY_PIVOT("firstQuarter", "category", , "month")')).table,
    ).toEqual([
      ['Category', '2024-01', '2024-02', '2024-03'],
      ['Power', -10, 0, 0],
      ['Groceries', 0, -30, 0],
    ]);
  });

  it('sorts the rows by the row total', async () => {
    expect(
      (await run('=QUERY_PIVOT("firstQuarter", "category", "desc", "month")'))
        .table,
    ).toEqual([
      ['Category', '2024-01', '2024-02', '2024-03'],
      ['Power', -10, 0, 0],
      ['Groceries', 0, -30, 0],
    ]);
    expect(
      (await run('=QUERY_PIVOT("firstQuarter", "category", "asc", "month")'))
        .table,
    ).toEqual([
      ['Category', '2024-01', '2024-02', '2024-03'],
      ['Groceries', 0, -30, 0],
      ['Power', -10, 0, 0],
    ]);
  });

  it('sorts the columns with sort 2', async () => {
    expect(
      (await run('=QUERY_PIVOT("firstQuarter", "category", , "month", "asc")'))
        .table,
    ).toEqual([
      ['Category', '2024-02', '2024-01', '2024-03'],
      ['Power', 0, -10, 0],
      ['Groceries', -30, 0, 0],
    ]);
    expect(
      (await run('=QUERY_PIVOT("all", "category group", , "category", "name")'))
        .table,
    ).toEqual([
      ['Group', 'Groceries', 'Power', 'Rent'],
      ['Bills', 0, -50, -20],
      ['Food', -120, 0, 0],
    ]);
  });

  it('gives counts for QUERY_PIVOT_COUNT', async () => {
    expect(
      (await run('=QUERY_PIVOT_COUNT("firstQuarter", "category", , "month")'))
        .table,
    ).toEqual([
      ['Category', '2024-01', '2024-02', '2024-03'],
      ['Power', 1, 0, 0],
      ['Groceries', 0, 3, 0],
    ]);
  });

  it('works inside other functions', async () => {
    expect(
      await run(
        '=INDEX(QUERY_PIVOT("firstQuarter", "category", , "month"), 3, 3)',
        'value',
      ),
    ).toEqual({ value: -30, issues: [] });
  });

  it('gives a warning for a table with more than 20 columns', async () => {
    const result = await run(
      '=QUERY_PIVOT("firstQuarter", "category", , "day")',
    );

    expect(result.table?.[0]).toHaveLength(92);
    // 92 columns is also more than the table view shows
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'warning', kind: 'large-table' }),
      expect.objectContaining({ severity: 'warning', kind: 'table-cut' }),
    ]);
  });

  it('gives an error without a dimension for the columns', async () => {
    await expect(run('=QUERY_PIVOT("all", "category")')).rejects.toThrow(
      'Give a dimension for the columns',
    );
  });
});

describe('source map', () => {
  const firstQuarterDates = { start: '2024-01-01', end: '2024-03-31' };

  it('gives the transactions of each group', async () => {
    const { sourceMap } = await run('=QUERY_GROUP("all", "category")');
    if (!sourceMap) throw new Error('No source map');
    expect(getCellTransactionsFilter(sourceMap, 0, 1)).toEqual({
      dateRange: null,
      conditions: [{ field: 'category', op: 'is', value: 'power', type: 'id' }],
    });
    // The label cell gives the same transactions as its value
    expect(getCellTransactionsFilter(sourceMap, 0, 0)).toEqual(
      getCellTransactionsFilter(sourceMap, 0, 1),
    );
    expect(getCellTransactionsFilter(sourceMap, 2, 1)).toEqual({
      dateRange: null,
      conditions: [
        {
          customName: 'Category: Uncategorized',
          queryFilter: { category: null, is_parent: false },
        },
      ],
    });
    expect(getColumnTransactionsFilter(sourceMap, 1)).toEqual({
      dateRange: null,
      conditions: [],
    });
  });

  it('gives the days of a period inside the query time frame', async () => {
    const { sourceMap } = await run(
      '=QUERY_GROUP("firstQuarter", "category", , "month")',
    );
    if (!sourceMap) throw new Error('No source map');
    // The row of Power in February
    expect(getCellTransactionsFilter(sourceMap, 1, 2)).toEqual({
      dateRange: { start: '2024-02-01', end: '2024-02-29' },
      conditions: [{ field: 'category', op: 'is', value: 'power', type: 'id' }],
    });
    expect(sourceMap.query.dateRange).toEqual(firstQuarterDates);
  });

  it('gives a week from its first day', async () => {
    const { sourceMap } = await run('=QUERY_GROUP("all", "week")');
    expect(sourceMap?.rows[0]?.dateRange).toEqual({
      start: '2023-12-31',
      end: '2024-01-06',
    });
  });

  it('gives the row and the column of a wide table', async () => {
    const { sourceMap } = await run(
      '=QUERY_PIVOT("firstQuarter", "category", , "month")',
    );
    if (!sourceMap) throw new Error('No source map');
    const power = { field: 'category', op: 'is', value: 'power', type: 'id' };
    const january = { start: '2024-01-01', end: '2024-01-31' };
    // The header row and the name column
    expect(getCellTransactionsFilter(sourceMap, 0, 0)).toBeNull();
    expect(getCellTransactionsFilter(sourceMap, 0, 1)).toEqual({
      dateRange: january,
      conditions: [],
    });
    expect(getCellTransactionsFilter(sourceMap, 1, 0)).toEqual({
      dateRange: firstQuarterDates,
      conditions: [power],
    });
    expect(getCellTransactionsFilter(sourceMap, 1, 1)).toEqual({
      dateRange: january,
      conditions: [power],
    });
    expect(getRowTransactionsFilter(sourceMap, 1)).toEqual({
      dateRange: firstQuarterDates,
      conditions: [power],
    });
    expect(getColumnTransactionsFilter(sourceMap, 1)).toEqual({
      dateRange: january,
      conditions: [],
    });
  });

  it('gives the shared conditions of the rows that a chart value adds up', async () => {
    const { sourceMap } = await run(
      '=QUERY_GROUP("all", "category group", , "category")',
    );
    if (!sourceMap) throw new Error('No source map');
    const cells = (...rowIndexes: number[]) =>
      rowIndexes.map(rowIndex => ({ rowIndex, columnIndex: 2 }));
    // The rows of Bills: Rent and Power
    expect(getCellsTransactionsFilter(sourceMap, cells(0, 1))).toEqual({
      dateRange: null,
      conditions: [
        { field: 'category_group', op: 'is', value: 'bills', type: 'id' },
      ],
    });
    // Rent and Groceries share no condition, and Power is not in the cells
    expect(getCellsTransactionsFilter(sourceMap, cells(0, 2))).toBeNull();
  });

  it('gives all periods of the rows of one category', async () => {
    const { sourceMap } = await run(
      '=QUERY_GROUP("firstQuarter", "category", , "month")',
    );
    if (!sourceMap) throw new Error('No source map');
    // The three months of Power
    expect(
      getCellsTransactionsFilter(
        sourceMap,
        [0, 1, 2].map(rowIndex => ({ rowIndex, columnIndex: 2 })),
      ),
    ).toEqual({
      dateRange: firstQuarterDates,
      conditions: [{ field: 'category', op: 'is', value: 'power', type: 'id' }],
    });
  });

  it('works through a provider that is one call', async () => {
    const result = await executeFormula({
      formula: '=Spending',
      resolveQuery: name => resolveQuery(name, { localQueries, library: [] }),
      accounts: [],
      cardProviders: { Spending: { formula: '=QUERY_GROUP("all", "payee")' } },
      language: 'en-US',
      output: 'table',
    });
    expect(result.sourceMap?.rows).toHaveLength(2);
  });

  it('gives no source map when other functions change the rows', async () => {
    for (const formula of [
      '=SORT(QUERY_GROUP("all", "category"), 2, 1)',
      '=QUERY_GROUP("all", "category") & "!"',
      '=VSTACK(QUERY_GROUP("all", "category"), QUERY_GROUP("all", "payee"))',
    ]) {
      expect((await run(formula)).sourceMap).toBeUndefined();
    }
  });
});
