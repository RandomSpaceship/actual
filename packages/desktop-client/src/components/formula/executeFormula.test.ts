import { send } from '@actual-app/core/platform/client/connection';
import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeFormula } from './executeFormula';
import type { FormulaOutput } from './executeFormula';
import { resolveQuery } from './resolveQuery';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

function provider(name: string, formula: string): FormulaLibraryItemEntity {
  return { id: name, type: 'provider', name, data: { formula }, created_at: 0 };
}

const localQueries = {
  a: {},
  // A query with a time frame gives a different sum in the mock
  b: {
    timeFrame: {
      start: '2024-01-01',
      end: '2024-01-31',
      mode: 'static' as const,
    },
  },
  c: {},
  // A time frame in months includes the full months
  february: {
    timeFrame: { start: '2024-02', end: '2024-02', mode: 'static' as const },
  },
};

function run(
  formula: string,
  library: FormulaLibraryItemEntity[] = [],
  output?: FormulaOutput,
) {
  return executeFormula({
    formula,
    resolveQuery: name => resolveQuery(name, { localQueries, library }),
    accounts: [],
    library,
    language: 'en-US',
    output,
  });
}

beforeEach(() => {
  // Each sum is 123.45 (9.99 with a time frame) and each count is 5
  vi.mocked(send).mockImplementation((async (name: string, query: unknown) => {
    if (name === 'make-filters-from-conditions') return { filters: [] };
    if (name === 'query') {
      const serialized = JSON.stringify(query);
      if (serialized.includes('$count')) return { data: 5 };
      return { data: serialized.includes('$gte') ? 999 : 12345 };
    }
    return undefined;
  }) as unknown as typeof send);
});

describe('executeFormula', () => {
  it('evaluates the providers that the formula uses', async () => {
    const library = [
      provider('Doubled', '=QUERY("a") * 2'),
      provider('Total', '=Doubled + QUERY_COUNT("b")'),
    ];

    expect(await run('=total / 2', library)).toEqual({
      value: (123.45 * 2 + 5) / 2,
      issues: [],
    });
  });

  it('evaluates card providers, also in library providers', async () => {
    const library = [
      provider('Total', '=Doubled + 1'),
      provider('Doubled', '=1000'),
    ];

    const result = await executeFormula({
      formula: '=Total',
      resolveQuery: name => resolveQuery(name, { localQueries, library }),
      accounts: [],
      library,
      cardProviders: { Doubled: { formula: '=QUERY("a") * 2' } },
      language: 'en-US',
    });

    expect(result.value).toBe(123.45 * 2 + 1);
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'shadowed', name: 'Doubled' }),
    ]);
  });

  it('fetches a query whose name depends on the data of another query', async () => {
    const result = await run('=QUERY(IF(QUERY_COUNT("a") > 0, "b", "c"))');

    expect(result).toEqual({ value: 9.99, issues: [] });
  });

  it('gives an error for an unknown provider', async () => {
    expect(await run('=Missing + 1')).toEqual({
      value: null,
      issues: [
        expect.objectContaining({
          kind: 'missing-provider',
          message: 'Provider "Missing" not found',
        }),
      ],
    });
  });

  it('gives an error for providers that use each other', async () => {
    const result = await run('=Loop', [provider('Loop', '=Loop + 1')]);

    expect(result.value).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'provider-cycle' }),
    ]);
  });

  it('names the provider that gives an error', async () => {
    const result = await run('=Outer', [
      provider('Outer', '=Inner + 1'),
      provider('Inner', '=1 / 0'),
    ]);

    expect(result).toEqual({
      value: null,
      issues: [
        expect.objectContaining({
          kind: 'provider-error',
          message: 'Provider "Inner" gives the error #DIV/0!',
        }),
      ],
    });
  });

  it('does not give a provider error when the formula handles the error', async () => {
    expect(
      await run('=IFERROR(Inner, 7)', [provider('Inner', '=1 / 0')]),
    ).toEqual({ value: 7, issues: [] });
  });

  it('gives the days that a query includes', async () => {
    expect(await run('=QUERY_START_DATE("february")')).toEqual({
      value: '2024-02-01',
      issues: [],
    });
    expect(await run('=QUERY_END_DATE("b")')).toEqual({
      value: '2024-01-31',
      issues: [],
    });
    expect(await run('=QUERY_DAYS("february") + QUERY_DAYS("b")')).toEqual({
      value: 29 + 31,
      issues: [],
    });
    expect(
      await run('=QUERY_END_DATE("february") - QUERY_START_DATE("b") + 1'),
    ).toEqual({ value: 31 + 29, issues: [] });
  });

  it('gives no days for a query without a time frame', async () => {
    expect(await run('=QUERY_START_DATE("a")')).toEqual({
      value: '',
      issues: [],
    });
    await expect(run('=QUERY_DAYS("a")')).rejects.toThrow('VALUE');
  });

  it('gives a table for a formula that spills', async () => {
    expect(await run('={1, 1 / 0; "a", QUERY("a")}', [], 'table')).toEqual({
      value: null,
      table: [
        [1, { error: '#DIV/0!' }],
        ['a', 123.45],
      ],
      spills: true,
      issues: [],
    });
  });

  it('gives a single value as a table for the table output', async () => {
    expect(await run('=QUERY("a")', [], 'table')).toEqual({
      value: 123.45,
      table: [[123.45]],
      issues: [],
    });
  });

  it('gives a table or one value for the automatic output', async () => {
    expect(await run('=SEQUENCE(2, 1)', [], 'auto')).toEqual({
      value: null,
      table: [[1], [2]],
      spills: true,
      issues: [],
    });
    expect(await run('=QUERY("a")', [], 'auto')).toEqual({
      value: 123.45,
      issues: [],
    });
  });

  it('tells each output that a formula spills', async () => {
    expect((await run('=SEQUENCE(2, 1)', [], 'value')).spills).toBe(true);
    expect((await run('=SEQUENCE(2, 1)', [], 'table')).spills).toBe(true);
    expect((await run('=QUERY("a")', [], 'table')).spills).toBeUndefined();
  });

  it('gives an error for a table when the output is one value', async () => {
    const result = await run('=SEQUENCE(2, 2)');

    expect(result.value).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'error', kind: 'table-result' }),
    ]);
  });

  it('uses a provider that gives one value in a table formula', async () => {
    expect(
      await run('={Base, Base + 1}', [provider('Base', '=QUERY("a")')], 'auto'),
    ).toEqual({
      value: null,
      table: [[123.45, 124.45]],
      spills: true,
      issues: [],
    });
  });

  it('uses a provider that gives a table', async () => {
    const grid = provider('Grid', '=SEQUENCE(3, 2)');

    expect(await run('=INDEX(Grid, 3, 2) + SUM(Grid)', [grid])).toEqual({
      value: 6 + 21,
      issues: [],
    });
    expect(await run('=TRANSPOSE(Grid)', [grid], 'auto')).toEqual({
      value: null,
      table: [
        [1, 3, 5],
        [2, 4, 6],
      ],
      spills: true,
      issues: [],
    });
    expect((await run('= Grid ', [grid], 'auto')).table).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(
      (await run('=VLOOKUP(3, Grid, 2, FALSE()) + ROWS(Grid)', [grid])).value,
    ).toBe(4 + 3);
  });

  it('uses a provider that gives a table in another provider', async () => {
    const result = await run(
      '=Sorted',
      [
        provider('Sorted', '=SORT(Grid, 1, -1)'),
        provider('Grid', '={1, "a"; 3, "b"; 2, "c"}'),
      ],
      'auto',
    );

    expect(result.table).toEqual([
      [3, 'b'],
      [2, 'c'],
      [1, 'a'],
    ]);
  });

  it('gives a table with more than 26 columns from a provider', async () => {
    const result = await run('=INDEX(Wide, 1, 30)', [
      provider('Wide', '=TRANSPOSE(SEQUENCE(30))'),
    ]);

    expect(result.value).toBe(30);
  });

  it('names the provider that gives an error, also next to a table provider', async () => {
    const result = await run('=SUM(Grid) + Other', [
      provider('Grid', '=SEQUENCE(2, 2)'),
      provider('Other', '=1 / 0'),
    ]);

    expect(result).toEqual({
      value: null,
      issues: [
        expect.objectContaining({ kind: 'provider-error', name: 'Other' }),
      ],
    });
  });
});
