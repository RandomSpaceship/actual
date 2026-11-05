import { send } from '@actual-app/core/platform/client/connection';
import type { RuleConditionEntity } from '@actual-app/core/types/models';
import { describe, expect, it, vi } from 'vitest';

import {
  combineTransactionsFilters,
  getQueryTransactionsFilter,
  getSourceFunctionName,
  toFilterConditions,
} from './formulaSourceMap';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

describe('getSourceFunctionName', () => {
  it('gives the function of a formula that is one call', () => {
    expect(getSourceFunctionName('=QUERY_GROUP("a", "category")', [])).toBe(
      'QUERY_GROUP',
    );
    expect(getSourceFunctionName(' = query_table("a", TRUE())', [])).toBe(
      'QUERY_TABLE',
    );
    // Brackets and quotes in the text of an argument
    expect(getSourceFunctionName('=QUERY_GROUP("a ("" b", "payee")', [])).toBe(
      'QUERY_GROUP',
    );
  });

  it('gives null for a formula that does more than one call', () => {
    for (const formula of [
      '=SORT(QUERY_GROUP("a", "category"))',
      '=QUERY_GROUP("a", "category") & "x"',
      '=QUERY("a")',
      '=QUERY_GROUP("a", "category"',
    ]) {
      expect(getSourceFunctionName(formula, [])).toBeNull();
    }
  });

  it('follows a named formula that is all of the formula', () => {
    const namedFormulas = [
      {
        name: 'Spending',
        formula: '=QUERY_PIVOT("a", "category", , "month")',
        uses: [],
      },
      { name: 'Sorted', formula: '=SORT(Spending)', uses: ['Spending'] },
    ];
    expect(getSourceFunctionName('=spending', namedFormulas)).toBe(
      'QUERY_PIVOT',
    );
    expect(getSourceFunctionName('=Sorted', namedFormulas)).toBeNull();
    expect(getSourceFunctionName('=Unknown', namedFormulas)).toBeNull();
  });
});

describe('combineTransactionsFilters', () => {
  it('keeps the days that are in all date ranges', () => {
    expect(
      combineTransactionsFilters(
        {
          dateRange: { start: '2024-01-01', end: '2024-03-31' },
          conditions: [],
        },
        null,
        {
          dateRange: { start: '2024-03-01', end: '2024-04-30' },
          conditions: [],
        },
      ),
    ).toEqual({
      dateRange: { start: '2024-03-01', end: '2024-03-31' },
      conditions: [],
    });
  });
});

describe('toFilterConditions', () => {
  it('adds the date range as two date filters', () => {
    expect(
      toFilterConditions({
        dateRange: { start: '2024-03-01', end: '2024-03-31' },
        conditions: [{ field: 'payee', op: 'is', value: 'shop', type: 'id' }],
      }),
    ).toEqual([
      { field: 'payee', op: 'is', value: 'shop', type: 'id' },
      { field: 'date', op: 'gte', value: '2024-03-01', type: 'date' },
      { field: 'date', op: 'lte', value: '2024-03-31', type: 'date' },
    ]);
  });
});

describe('getQueryTransactionsFilter', () => {
  const shop = {
    field: 'payee',
    op: 'is',
    value: 'shop',
    type: 'id',
  } satisfies RuleConditionEntity;
  const cafe = {
    field: 'payee',
    op: 'is',
    value: 'cafe',
    type: 'id',
  } satisfies RuleConditionEntity;

  it('keeps the conditions of an "and" query', async () => {
    expect(
      await getQueryTransactionsFilter(
        'spending',
        { conditions: [shop, cafe], conditionsOp: 'and' },
        null,
      ),
    ).toEqual({ dateRange: null, conditions: [shop, cafe] });
  });

  it('makes one AQL filter of an "or" query', async () => {
    vi.mocked(send).mockResolvedValue({
      filters: [{ payee: 'shop' }, { payee: 'cafe' }],
    });
    expect(
      await getQueryTransactionsFilter(
        'spending',
        { conditions: [shop, cafe], conditionsOp: 'or' },
        { start: '2024-01-01', end: '2024-01-31', days: 31 },
      ),
    ).toEqual({
      dateRange: { start: '2024-01-01', end: '2024-01-31' },
      conditions: [
        {
          customName: 'Query: spending',
          queryFilter: { $or: [{ payee: 'shop' }, { payee: 'cafe' }] },
        },
      ],
    });
  });

  it('gives null for an AQL query that does not read transactions', async () => {
    expect(
      await getQueryTransactionsFilter(
        'names',
        { aql: { text: '{"table": "payees", "select": ["name"]}' } },
        null,
      ),
    ).toBeNull();
  });
});
