import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import {
  listNamedFormulaNames,
  resolveNamedFormulas,
} from './resolveNamedFormulas';

function namedFormula(
  id: string,
  name: string,
  formula: string,
): FormulaLibraryItemEntity {
  return { id, type: 'named-formula', name, data: { formula }, created_at: 0 };
}

function names(result: ReturnType<typeof resolveNamedFormulas>) {
  return result.namedFormulas.map(({ name }) => name);
}

describe('resolveNamedFormulas', () => {
  it('finds the named formulas that the formula uses, also through other named formulas', () => {
    const library = [
      namedFormula('1', 'NetIncome', '=Income - Spending'),
      namedFormula('2', 'Income', '=QUERY("income")'),
      namedFormula('3', 'Spending', '=QUERY("spending")'),
      namedFormula('4', 'Unused', '=1'),
      {
        id: '5',
        type: 'query' as const,
        name: 'Unused2',
        data: {},
        created_at: 0,
      },
    ];

    const result = resolveNamedFormulas(['=netincome / 12'], library);

    expect(names(result)).toEqual(['NetIncome', 'Income', 'Spending']);
    expect(result.namedFormulas[0].uses).toEqual(['Income', 'Spending']);
    expect(result.issues).toEqual([]);
  });

  it('gives an error for a name that is not a named formula', () => {
    const result = resolveNamedFormulas(
      ['=Total + 1'],
      [namedFormula('1', 'Total', '=Missing * 2')],
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        kind: 'missing-named-formula',
        name: 'Missing',
      }),
    ]);
  });

  it('does not treat the other names as named formulas', () => {
    expect(
      resolveNamedFormulas(
        ['=IF(Spending > Limit, "red", "")'],
        [],
        ['Spending'],
      ).issues,
    ).toEqual([expect.objectContaining({ name: 'Limit' })]);
  });

  it('gives one error for named formulas that use each other', () => {
    const result = resolveNamedFormulas(
      ['=A.total + Self'],
      [
        namedFormula('1', 'A.total', '=B.total'),
        namedFormula('2', 'B.total', '=A.total + 1'),
        namedFormula('3', 'Self', '=Self'),
      ],
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        kind: 'named-formula-cycle',
        message: 'Named formulas "A.total", "B.total" use each other',
      }),
    ]);
  });

  it('names a named formula that uses itself', () => {
    expect(
      resolveNamedFormulas(['=Self'], [namedFormula('1', 'Self', '=Self + 1')])
        .issues[0].message,
    ).toBe('Named formula "Self" uses itself');
  });

  it('uses the oldest named formula of a duplicate name, with a warning', () => {
    const result = resolveNamedFormulas(
      ['=Total'],
      [namedFormula('old', 'Total', '=1'), namedFormula('new', 'TOTAL', '=2')],
    );

    expect(result.namedFormulas).toEqual([
      { name: 'Total', formula: '=1', uses: [] },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'warning', kind: 'duplicate-name' }),
    ]);
  });

  it('uses a card named formula, also in library named formulas, with a warning for a hidden name', () => {
    const library = [
      namedFormula('1', 'Net', '=Income - 10'),
      namedFormula('2', 'Income', '=1000'),
    ];

    const result = resolveNamedFormulas(['=Net'], library, [], {
      INCOME: { formula: '=Bonus + 1' },
      Bonus: { formula: '=5' },
    });

    expect(result.namedFormulas).toEqual([
      { name: 'Net', formula: '=Income - 10', uses: ['Income'] },
      { name: 'INCOME', formula: '=Bonus + 1', uses: ['Bonus'] },
      { name: 'Bonus', formula: '=5', uses: [] },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        kind: 'shadowed',
        name: 'Income',
        message:
          'The card named formula "INCOME" hides the library named formula',
      }),
    ]);
  });

  it('uses the exact card named formula name first', () => {
    expect(
      resolveNamedFormulas(['=total'], [], [], {
        Total: { formula: '=1' },
        total: { formula: '=2' },
      }).namedFormulas,
    ).toEqual([{ name: 'total', formula: '=2', uses: [] }]);
  });

  it('finds a cycle through card and library named formulas', () => {
    const result = resolveNamedFormulas(
      ['=Card'],
      [namedFormula('1', 'Shared', '=Card + 1')],
      [],
      { Card: { formula: '=Shared' } },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'named-formula-cycle',
        message: 'Named formulas "Card", "Shared" use each other',
      }),
    ]);
  });
});

describe('listNamedFormulaNames', () => {
  it('lists card named formulas first, and not the library names that they hide', () => {
    expect(
      listNamedFormulaNames(
        [namedFormula('1', 'Total', '=1'), namedFormula('2', 'Net', '=2')],
        { TOTAL: { formula: '=3' } },
      ),
    ).toEqual({ TOTAL: '=3', Net: '=2' });
  });

  it('lists each named formula name once, with the oldest formula', () => {
    expect(
      listNamedFormulaNames([
        namedFormula('old', 'Total', '=1'),
        namedFormula('new', 'TOTAL', '=2'),
        namedFormula('net', 'Net', '=3'),
        { id: 'q', type: 'query', name: 'food', data: {}, created_at: 0 },
      ]),
    ).toEqual({ Total: '=1', Net: '=3' });
  });
});
