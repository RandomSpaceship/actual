import { describe, expect, it } from 'vitest';

import { getFormulaTableColumnTypes } from './FormulaTable';

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
});
