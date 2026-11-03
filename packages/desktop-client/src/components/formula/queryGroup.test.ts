import { send } from '@actual-app/core/platform/client/connection';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeFormula } from './executeFormula';
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
      { key0: 'power', key1: '2024-01', value: -1000 },
      { key0: 'groceries', key1: '2024-02', value: -3000 },
    ];
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
      (await run('=QUERY_GROUP("all", "category", , "name")')).table,
    ).toEqual([
      ['Groceries', -120],
      ['Power', -50],
      ['Uncategorized', 3],
    ]);
    expect(
      (await run('=QUERY_GROUP("all", "Category", "", "ASC")')).table,
    ).toEqual([
      ['Groceries', -120],
      ['Power', -50],
      ['Uncategorized', 3],
    ]);
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
      (await run('=QUERY_GROUP("firstQuarter", "category", "month", "asc")'))
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
