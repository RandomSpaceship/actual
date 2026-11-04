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

function run(formula: string) {
  return executeFormula({
    formula,
    resolveQuery: name => resolveQuery(name, { localQueries: {}, library }),
    accounts: [],
    library,
    language: 'en-US',
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
      'Query "byPayee": This AQL query gives a table, because it has select, groupBy, orderBy, limit or offset',
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
