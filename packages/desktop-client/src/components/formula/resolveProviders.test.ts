import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import { listProviderNames, resolveProviders } from './resolveProviders';

function provider(
  id: string,
  name: string,
  formula: string,
): FormulaLibraryItemEntity {
  return { id, type: 'provider', name, data: { formula }, created_at: 0 };
}

function names(result: ReturnType<typeof resolveProviders>) {
  return result.providers.map(({ name }) => name);
}

describe('resolveProviders', () => {
  it('finds the providers that the formula uses, also through other providers', () => {
    const library = [
      provider('1', 'NetIncome', '=Income - Spending'),
      provider('2', 'Income', '=QUERY("income")'),
      provider('3', 'Spending', '=QUERY("spending")'),
      provider('4', 'Unused', '=1'),
      {
        id: '5',
        type: 'query' as const,
        name: 'Unused2',
        data: {},
        created_at: 0,
      },
    ];

    const result = resolveProviders(['=netincome / 12'], library);

    expect(names(result)).toEqual(['NetIncome', 'Income', 'Spending']);
    expect(result.providers[0].uses).toEqual(['Income', 'Spending']);
    expect(result.issues).toEqual([]);
  });

  it('gives an error for a name that is not a provider', () => {
    const result = resolveProviders(
      ['=Total + 1'],
      [provider('1', 'Total', '=Missing * 2')],
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        kind: 'missing-provider',
        name: 'Missing',
      }),
    ]);
  });

  it('does not treat the other names as providers', () => {
    expect(
      resolveProviders(['=IF(Spending > Limit, "red", "")'], [], ['Spending'])
        .issues,
    ).toEqual([expect.objectContaining({ name: 'Limit' })]);
  });

  it('gives one error for providers that use each other', () => {
    const result = resolveProviders(
      ['=A.total + Self'],
      [
        provider('1', 'A.total', '=B.total'),
        provider('2', 'B.total', '=A.total + 1'),
        provider('3', 'Self', '=Self'),
      ],
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        kind: 'provider-cycle',
        message: 'Providers "A.total", "B.total" use each other',
      }),
    ]);
  });

  it('names a provider that uses itself', () => {
    expect(
      resolveProviders(['=Self'], [provider('1', 'Self', '=Self + 1')])
        .issues[0].message,
    ).toBe('Provider "Self" uses itself');
  });

  it('uses the oldest provider of a duplicate name, with a warning', () => {
    const result = resolveProviders(
      ['=Total'],
      [provider('old', 'Total', '=1'), provider('new', 'TOTAL', '=2')],
    );

    expect(result.providers).toEqual([
      { name: 'Total', formula: '=1', uses: [] },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'warning', kind: 'duplicate-name' }),
    ]);
  });
});

describe('listProviderNames', () => {
  it('lists each provider name once, with the oldest formula', () => {
    expect(
      listProviderNames([
        provider('old', 'Total', '=1'),
        provider('new', 'TOTAL', '=2'),
        provider('net', 'Net', '=3'),
        { id: 'q', type: 'query', name: 'food', data: {}, created_at: 0 },
      ]),
    ).toEqual({ Total: '=1', Net: '=3' });
  });
});
