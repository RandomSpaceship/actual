import { send, sendCatch } from '@actual-app/core/platform/client/connection';
import type {
  FormulaLibraryAqlQueryData,
  FormulaLibraryItemEntity,
} from '@actual-app/core/types/models';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeFormula } from './executeFormula';
import { resolveQuery } from './resolveQuery';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
  sendCatch: vi.fn(),
}));

type SentQuery = {
  table: string;
  filterExpressions: unknown[];
  selectExpressions: unknown[];
  groupExpressions: unknown[];
  calculation: boolean;
  withDead: boolean;
  rawMode: boolean;
  limit: number | null;
};

// The rows that a table query gets, before its limit
const tableRows = [
  { 'payee.name': 'Cafe', total: -1250, count: 3, id: 'cafe-1' },
  { 'payee.name': 'Shop', total: -500, count: 1, id: 'shop-1' },
  { 'payee.name': null, total: 200, count: 1, id: 'none-1' },
];

const spendByPayee = {
  table: 'transactions',
  groupBy: ['payee.name'],
  select: [
    'payee.name',
    { total: { $sum: '$amount' } },
    { count: { $count: '$id' } },
  ],
};

const january = {
  start: '2024-01',
  end: '2024-01',
  mode: 'static' as const,
};

function aqlItem(
  name: string,
  aql: unknown,
  data: Omit<FormulaLibraryAqlQueryData, 'aql'> = {},
): FormulaLibraryItemEntity {
  return {
    id: name,
    type: 'aql-query',
    name,
    data: { aql: JSON.stringify(aql), ...data },
    created_at: 0,
  };
}

const library = [
  aqlItem('coffee', {
    table: 'transactions',
    filter: { 'payee.name': { $like: '%cafe%' } },
  }),
  aqlItem(
    'coffeeJanuary',
    { table: 'transactions', filter: { 'payee.name': 'Cafe' } },
    { timeFrame: january },
  ),
  aqlItem(
    'noDateField',
    { table: 'transactions', filter: { 'payee.name': 'Cafe' } },
    { timeFrame: january, dateField: null },
  ),
  aqlItem('total', { table: 'transactions', calculate: { $sum: '$amount' } }),
  aqlItem('count', { table: 'transactions', calculate: { $count: '*' } }),
  aqlItem(
    'scheduleCount',
    { table: 'schedules', calculate: { $sum: '$amount' } },
    { isCount: true },
  ),
  aqlItem('byPayee', {
    table: 'transactions',
    groupBy: ['payee.name'],
    select: ['payee.name'],
  }),
  aqlItem('spendByPayee', spendByPayee),
  aqlItem('countIsMoney', spendByPayee, { moneyColumns: ['count'] }),
  aqlItem('twoRows', spendByPayee, { rowLimit: 2 }),
  aqlItem('ownLimit', { ...spendByPayee, limit: 2 }, { rowLimit: 2 }),
  aqlItem('cafeByPayee', {
    ...spendByPayee,
    filter: { 'payee.name': 'Cafe' },
  }),
  aqlItem('byMonth', {
    table: 'transactions',
    groupBy: [{ $month: '$date' }],
    select: [{ month: { $month: '$date' } }],
  }),
  aqlItem('transactionIds', {
    table: 'transactions',
    select: ['id', 'amount'],
  }),
  aqlItem('payeeNames', { table: 'payees', select: ['name'] }),
  aqlItem('badField', {
    table: 'transactions',
    filter: { nope: 1 },
  }),
  {
    id: 'bad',
    type: 'aql-query',
    name: 'bad',
    data: { aql: '{' },
    created_at: 0,
  },
] satisfies FormulaLibraryItemEntity[];

let sentQueries: SentQuery[] = [];

function run(formula: string, output: 'value' | 'table' = 'value') {
  return executeFormula({
    formula,
    resolveQuery: name => resolveQuery(name, { localQueries: {}, library }),
    accounts: [],
    library,
    language: 'en-US',
    output,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sentQueries = [];
  vi.mocked(sendCatch).mockImplementation((async (
    name: string,
    query: SentQuery,
  ) => {
    if (name !== 'query') return { data: undefined, error: undefined };
    sentQueries.push(query);
    if (!query.calculation) {
      return {
        data: { data: tableRows.slice(0, query.limit ?? undefined) },
        error: undefined,
      };
    }
    if (JSON.stringify(query.filterExpressions).includes('nope')) {
      return {
        data: undefined,
        error: {
          type: 'ServerError',
          message:
            'Field "nope" does not exist in table "transactions"\n\nExpression stack:\n  $nope',
        },
      };
    }
    const calculation = JSON.stringify(query.selectExpressions);
    return {
      data: { data: calculation.includes('$count') ? 3 : -1250 },
      error: undefined,
    };
  }) as unknown as typeof sendCatch);
  vi.mocked(send).mockImplementation((async (name: string) => {
    if (name === 'payees-get') return [{ id: 'cafe', name: 'Cafe' }];
    if (name === 'accounts-get') return [];
    if (name === 'query') {
      return { data: [{ key0: 'cafe', value: -1250 }] };
    }
    return undefined;
  }) as unknown as typeof send);
});

describe('AQL queries in formulas', () => {
  it('sums a filter query as an amount', async () => {
    expect(await run('=QUERY("coffee")')).toEqual({ value: -12.5, issues: [] });
    expect(sentQueries.at(-1)).toMatchObject({
      table: 'transactions',
      filterExpressions: [{ 'payee.name': { $like: '%cafe%' } }],
      withDead: false,
      rawMode: false,
    });
  });

  it('counts the rows of a filter query', async () => {
    expect(await run('=QUERY_COUNT("coffee")')).toEqual({
      value: 3,
      issues: [],
    });
  });

  it('gives a value query as an amount, and a $count as a count', async () => {
    expect(await run('=QUERY("total")')).toEqual({ value: -12.5, issues: [] });
    expect(await run('=QUERY("count")')).toEqual({ value: 3, issues: [] });
    expect(await run('=QUERY("scheduleCount")')).toEqual({
      value: -1250,
      issues: [],
    });
  });

  it('filters the date field by the time frame', async () => {
    await run('=QUERY("coffeeJanuary")');
    expect(sentQueries.at(-1)?.filterExpressions).toEqual([
      { 'payee.name': 'Cafe' },
      {
        $and: [
          { date: { $gte: '2024-01-01' } },
          { date: { $lte: '2024-01-31' } },
        ],
      },
    ]);
  });

  it('does not use the time frame without a date field', async () => {
    await run('=QUERY("noDateField")');
    expect(sentQueries.at(-1)?.filterExpressions).toEqual([
      { 'payee.name': 'Cafe' },
    ]);
  });

  it('groups a filter query with QUERY_GROUP', async () => {
    const result = await executeFormula({
      formula: '=QUERY_GROUP("coffee", "payee")',
      resolveQuery: name => resolveQuery(name, { localQueries: {}, library }),
      accounts: [],
      library,
      language: 'en-US',
      output: 'table',
    });
    expect(result.table).toEqual([['Cafe', -12.5]]);
    const groupedQuery = vi
      .mocked(send)
      .mock.calls.find(([name]) => name === 'query')?.[1];
    expect(groupedQuery).toMatchObject({
      filterExpressions: [{ 'payee.name': { $like: '%cafe%' } }],
    });
  });

  it('gives an error for a query of the wrong kind', async () => {
    expect((await run('=QUERY_COUNT("total")')).issues).toEqual([
      {
        severity: 'error',
        kind: 'query-failed',
        name: 'total',
        message:
          'Query "total": This AQL query gives one value. Use it in QUERY, or remove calculate to use it here',
      },
    ]);
    expect((await run('=QUERY("byPayee")')).issues[0]?.message).toBe(
      'Query "byPayee": This AQL query gives a table, because it has select, groupBy, orderBy, limit or offset. Use it in QUERY_TABLE',
    );
    expect(
      (await run('=QUERY_EXTRACT_CATEGORIES("coffee")')).issues[0]?.message,
    ).toBe(
      'Query "coffee": QUERY_EXTRACT_CATEGORIES does not work with an AQL query',
    );
  });

  it('gives the parse error or the compile error', async () => {
    expect((await run('=QUERY("bad")')).issues[0]?.message).toMatch(
      /^Query "bad": The query is not valid JSON/,
    );
    expect((await run('=QUERY("badField")')).issues[0]?.message).toBe(
      'Query "badField": Field "nope" does not exist in table "transactions"',
    );
    // The query that does not compile never goes through send, which shows
    // the error to every part of the app
    expect(vi.mocked(send).mock.calls.some(([name]) => name === 'query')).toBe(
      false,
    );
  });
});

describe('QUERY_TABLE', () => {
  it('gives the rows in select order, with amounts in the money columns', async () => {
    const result = await run('=QUERY_TABLE("spendByPayee")', 'table');
    expect(result.issues).toEqual([]);
    expect(result.table).toEqual([
      ['Cafe', -12.5, 3],
      ['Shop', -5, 1],
      [null, 2, 1],
    ]);
    // One more row than the row limit, to find a cut
    expect(sentQueries.at(-1)?.limit).toBe(1001);
  });

  it('adds the column names as the first row with TRUE()', async () => {
    const result = await run('=QUERY_TABLE("spendByPayee", TRUE())', 'table');
    expect(result.table?.[0]).toEqual(['payee.name', 'total', 'count']);
    expect(result.table).toHaveLength(4);
  });

  it('uses the money columns of the library query', async () => {
    const result = await run('=QUERY_TABLE("countIsMoney")', 'table');
    expect(result.table?.[0]).toEqual(['Cafe', -1250, 0.03]);
  });

  it('works inside other functions', async () => {
    expect(
      await run('=SUM(CHOOSECOLS(QUERY_TABLE("spendByPayee"), 2))'),
    ).toEqual({ value: -15.5, issues: [] });
  });

  it('warns when the row limit cuts the rows', async () => {
    const result = await run('=QUERY_TABLE("twoRows")', 'table');
    expect(result.table).toHaveLength(2);
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        kind: 'rows-cut',
        name: 'twoRows',
        message:
          'Query "twoRows" gives more than 2 rows, so the table stops there. Add a filter or a limit to the query, or change its row limit',
      },
    ]);
  });

  it('does not warn for a limit in the query', async () => {
    const result = await run('=QUERY_TABLE("ownLimit")', 'table');
    expect(result.table).toHaveLength(2);
    expect(result.issues).toEqual([]);
    expect(sentQueries.at(-1)?.limit).toBe(2);
  });

  it('gives an error for a query that is not a table query', async () => {
    expect((await run('=QUERY_TABLE("total")')).issues[0]?.message).toBe(
      'Query "total": This AQL query gives one value. Use it in QUERY',
    );
    expect((await run('=QUERY_TABLE("coffee")')).issues[0]?.message).toBe(
      'Query "coffee": This AQL query is a filter. Use it in QUERY, QUERY_COUNT, QUERY_GROUP or QUERY_PIVOT, or add select to use it in QUERY_TABLE',
    );
  });

  it('gives an error for a header that is not in the formula', async () => {
    await expect(run('=QUERY_TABLE("spendByPayee", 1 = 1)')).rejects.toThrow(
      /must be in the formula/,
    );
  });
});

describe('QUERY_TABLE source map', () => {
  it('gives the groupBy values of each row', async () => {
    const { sourceMap } = await run('=QUERY_TABLE("spendByPayee")', 'table');
    expect(sourceMap).toEqual({
      query: { dateRange: null, conditions: [] },
      rows: [
        {
          dateRange: null,
          conditions: [
            {
              customName: 'payee.name: Cafe',
              queryFilter: { 'payee.name': 'Cafe' },
            },
          ],
        },
        {
          dateRange: null,
          conditions: [
            {
              customName: 'payee.name: Shop',
              queryFilter: { 'payee.name': 'Shop' },
            },
          ],
        },
        {
          dateRange: null,
          conditions: [
            {
              customName: 'payee.name: ',
              queryFilter: { 'payee.name': null },
            },
          ],
        },
      ],
      columns: null,
      isComplete: true,
    });
  });

  it('gives the filter of the query as one condition', async () => {
    const { sourceMap } = await run('=QUERY_TABLE("cafeByPayee")', 'table');
    expect(sourceMap?.query.conditions).toEqual([
      {
        customName: 'Query: cafeByPayee',
        queryFilter: { $and: [{ 'payee.name': 'Cafe' }] },
      },
    ]);
  });

  it('gives no transactions for the header row', async () => {
    const { sourceMap } = await run(
      '=QUERY_TABLE("spendByPayee", TRUE())',
      'table',
    );
    expect(sourceMap?.rows).toHaveLength(4);
    expect(sourceMap?.rows[0]).toBeNull();
    expect(sourceMap?.rows[1]?.conditions[0]).toMatchObject({
      customName: 'payee.name: Cafe',
    });
  });

  it('gives one transaction for each row with an id column', async () => {
    const { sourceMap } = await run('=QUERY_TABLE("transactionIds")', 'table');
    expect(sourceMap?.rows[1]?.conditions).toEqual([
      { customName: 'id: shop-1', queryFilter: { id: 'shop-1' } },
    ]);
  });

  it('has not all rows of the query after a limit', async () => {
    expect(
      (await run('=QUERY_TABLE("twoRows")', 'table')).sourceMap?.isComplete,
    ).toBe(false);
    expect(
      (await run('=QUERY_TABLE("ownLimit")', 'table')).sourceMap?.isComplete,
    ).toBe(false);
  });

  it('gives no source map without plain groupBy fields or transactions', async () => {
    expect(
      (await run('=QUERY_TABLE("byMonth")', 'table')).sourceMap,
    ).toBeUndefined();
    expect(
      (await run('=QUERY_TABLE("payeeNames")', 'table')).sourceMap,
    ).toBeUndefined();
  });
});
