import { describe, expect, it } from 'vitest';

import { isFormulaValueFormattable } from './formatFormulaValue';
import {
  getFormulaTableColumnNames,
  getFormulaTableColumnTypes,
  getFormulaTableTotals,
  getFormulaTableUnformattableColumns,
  isFormulaTableHeaderRowShown,
} from './FormulaTable';

describe('getFormulaTableColumnTypes', () => {
  it('shows a column of numbers as money and other columns as text', () => {
    expect(
      getFormulaTableColumnTypes(
        [
          ['Rent', '2024-01', -50, { error: '#DIV/0!' }],
          ['Power', '2024-02', null, 3],
        ],
        [],
      ),
    ).toEqual(['text', 'text', 'money', 'money']);
  });

  it('uses the type that the column settings give', () => {
    expect(
      getFormulaTableColumnTypes(
        [['2024-01', 0.25, 4]],
        [{ type: 'date' }, { name: 'Share', type: 'percent' }, { name: 'n' }],
      ),
    ).toEqual(['date', 'percent', 'money']);
  });

  it('gives no columns for an empty table', () => {
    expect(getFormulaTableColumnTypes([], [])).toEqual([]);
  });

  it('does not use the header row to find the type', () => {
    expect(
      getFormulaTableColumnTypes(
        [
          ['', '2024-01'],
          ['Rent', -50],
        ],
        [],
        true,
      ),
    ).toEqual(['text', 'money']);
  });
});

describe('getFormulaTableColumnNames', () => {
  const table = [
    ['', '2024-01', '2024-02'],
    ['Rent', -50, -50],
  ];

  it('gives the names from the column settings without a header row', () => {
    expect(getFormulaTableColumnNames(table, [{ name: 'Category' }])).toEqual([
      'Category',
      '',
      '',
    ]);
  });

  it('gives the header row names, and a set name wins', () => {
    expect(
      getFormulaTableColumnNames(table, [{ name: 'Category' }, {}], true),
    ).toEqual(['Category', '2024-01', '2024-02']);
  });
});

describe('isFormulaTableHeaderRowShown', () => {
  it('finds the header row of a pivot table', () => {
    expect(
      isFormulaTableHeaderRowShown([
        ['', '2024-01', '2024-02'],
        ['Rent', -50, -50],
      ]),
    ).toBe(true);
  });

  it('finds no header row in group rows or in text', () => {
    expect(
      isFormulaTableHeaderRowShown([
        ['Rent', '2024-01', -50],
        ['Power', '2024-01', -20],
      ]),
    ).toBe(false);
    expect(
      isFormulaTableHeaderRowShown([
        ['Rent', 'Bills'],
        ['Power', 'Bills'],
      ]),
    ).toBe(false);
    expect(isFormulaTableHeaderRowShown([['Rent', 'Amount']])).toBe(false);
  });

  it('obeys the setting', () => {
    const table = [
      ['Rent', -50],
      ['Power', -20],
    ];
    expect(isFormulaTableHeaderRowShown(table, 'first-row')).toBe(true);
    expect(
      isFormulaTableHeaderRowShown(
        [
          ['', 'Amount'],
          ['Rent', -50],
        ],
        'none',
      ),
    ).toBe(false);
  });
});

describe('getFormulaTableTotals', () => {
  const bodyRows = [
    ['Rent', -50, 0.5, -20],
    ['Power', { error: '#DIV/0!' }, 0.25, -10],
  ];
  const columnTypes = ['text', 'money', 'percent', 'number'] as const;

  it('sums the money and number columns for the totals row', () => {
    expect(getFormulaTableTotals(bodyRows, [...columnTypes], 'row')).toEqual({
      rowTotals: null,
      columnTotals: [null, -50, null, -30],
      totalColumnType: 'money',
      labelColumn: 0,
    });
  });

  it('sums each row and all rows with both totals', () => {
    expect(getFormulaTableTotals(bodyRows, [...columnTypes], 'both')).toEqual({
      rowTotals: [-70, -10],
      columnTotals: [null, -50, null, -30, -80],
      totalColumnType: 'money',
      labelColumn: 0,
    });
  });

  it('gives no totals for none', () => {
    expect(getFormulaTableTotals(bodyRows, [...columnTypes], 'none')).toEqual({
      rowTotals: null,
      columnTotals: null,
      totalColumnType: 'money',
      labelColumn: -1,
    });
  });
});

describe('isFormulaValueFormattable', () => {
  it('needs a number for money, percent and number', () => {
    expect(isFormulaValueFormattable(12, 'money')).toBe(true);
    expect(isFormulaValueFormattable('Abc', 'money')).toBe(false);
    expect(isFormulaValueFormattable('12', 'percent')).toBe(false);
    expect(isFormulaValueFormattable(true, 'number')).toBe(false);
  });

  it('needs a date number, a date or a month for date', () => {
    expect(isFormulaValueFormattable(45000, 'date')).toBe(true);
    expect(isFormulaValueFormattable('2024-01-31', 'date')).toBe(true);
    expect(isFormulaValueFormattable('2024-01', 'date')).toBe(true);
    expect(isFormulaValueFormattable('January', 'date')).toBe(false);
  });

  it('can show any value as text, and an empty value in each format', () => {
    expect(isFormulaValueFormattable(12, 'text')).toBe(true);
    expect(isFormulaValueFormattable(null, 'money')).toBe(true);
  });
});

describe('getFormulaTableUnformattableColumns', () => {
  it('gives the columns with a set type that cannot show a cell', () => {
    expect(
      getFormulaTableUnformattableColumns(
        [
          ['Rent', 'Abc', 5, '2024-01'],
          ['Power', 3, { error: '#DIV/0!' }, 'soon'],
        ],
        [{}, { type: 'money' }, { type: 'number' }, { type: 'date' }],
      ),
    ).toEqual([1, 3]);
  });

  it('does not count the header row', () => {
    expect(
      getFormulaTableUnformattableColumns(
        [
          ['Name', 'Amount'],
          ['Rent', 5],
        ],
        [{}, { type: 'money' }],
        true,
      ),
    ).toEqual([]);
  });
});
