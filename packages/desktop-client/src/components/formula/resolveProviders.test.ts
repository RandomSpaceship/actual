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

  it('uses a card provider, also in library providers, with a warning for a hidden name', () => {
    const library = [
      provider('1', 'Net', '=Income - 10'),
      provider('2', 'Income', '=1000'),
    ];

    const result = resolveProviders(['=Net'], library, [], {
      INCOME: { formula: '=Bonus + 1' },
      Bonus: { formula: '=5' },
    });

    expect(result.providers).toEqual([
      { name: 'Net', formula: '=Income - 10', uses: ['Income'] },
      { name: 'INCOME', formula: '=Bonus + 1', uses: ['Bonus'] },
      { name: 'Bonus', formula: '=5', uses: [] },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        kind: 'shadowed',
        name: 'Income',
        message: 'The card provider "INCOME" hides the library provider',
      }),
    ]);
  });

  it('uses the exact card provider name first', () => {
    expect(
      resolveProviders(['=total'], [], [], {
        Total: { formula: '=1' },
        total: { formula: '=2' },
      }).providers,
    ).toEqual([{ name: 'total', formula: '=2', uses: [] }]);
  });

  it('finds a cycle through card and library providers', () => {
    const result = resolveProviders(
      ['=Card'],
      [provider('1', 'Shared', '=Card + 1')],
      [],
      { Card: { formula: '=Shared' } },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'provider-cycle',
        message: 'Providers "Card", "Shared" use each other',
      }),
    ]);
  });
});

describe('listProviderNames', () => {
  it('lists card providers first, and not the library names that they hide', () => {
    expect(
      listProviderNames(
        [provider('1', 'Total', '=1'), provider('2', 'Net', '=2')],
        { TOTAL: { formula: '=3' } },
      ),
    ).toEqual({ TOTAL: '=3', Net: '=2' });
  });

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
