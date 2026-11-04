import { describe, expect, it } from 'vitest';

import type { FormulaTable } from './executeFormula';
import { getFormulaChartData, rowNumberLabelColumn } from './formulaChartData';

const formatLabel = (value: unknown, type: string) =>
  type === 'date' ? `date:${String(value)}` : String(value);

const spending: FormulaTable = [
  ['Food', -120.5, 0.4],
  ['Rent', -900, 0.5],
  ['Fun', { error: '#N/A' }, 'n/a'],
];

describe('getFormulaChartData', () => {
  it('uses the first text column as the label and each number column as a series', () => {
    const chart = getFormulaChartData(
      spending,
      [{}, { name: 'Spent' }, { name: 'Share', type: 'percent' }],
      false,
      {},
      formatLabel,
    );
    expect(chart.type).toBe('bar');
    expect(chart.labelColumn).toBe(0);
    expect(chart.series).toEqual([
      { key: 'value0', columnIndex: 1, name: 'Spent', type: 'money' },
      { key: 'value1', columnIndex: 2, name: 'Share', type: 'percent' },
    ]);
    expect(chart.rows).toEqual([
      { label: 'Food', value0: -120.5, value1: 0.4 },
      { label: 'Rent', value0: -900, value1: 0.5 },
      // An error cell and text give a gap
      { label: 'Fun', value0: null, value1: null },
    ]);
    expect(chart.warnings).toEqual([]);
  });

  it('takes the names from the header row and skips it', () => {
    const chart = getFormulaChartData(
      [
        ['Month', 'Food', 'Rent'],
        ['2024-01', -1, -2],
        ['2024-02', -3, -4],
      ],
      [{ type: 'date' }],
      true,
      {},
      formatLabel,
    );
    expect(chart.series.map(series => series.name)).toEqual(['Food', 'Rent']);
    expect(chart.rows.map(row => row.label)).toEqual([
      'date:2024-01',
      'date:2024-02',
    ]);
  });

  it('uses the row numbers when the table has no text or date column', () => {
    const chart = getFormulaChartData([[5], [7]], [], false, {}, formatLabel);
    expect(chart.labelColumn).toBe(rowNumberLabelColumn);
    expect(chart.rows).toEqual([
      { label: '1', value0: 5 },
      { label: '2', value0: 7 },
    ]);
  });

  it('uses the columns that the settings give, and flips the signs', () => {
    const chart = getFormulaChartData(
      spending,
      [],
      false,
      { labelColumn: rowNumberLabelColumn, valueColumns: [1], flipSign: true },
      formatLabel,
    );
    expect(chart.rows.map(row => [row.label, row.value0])).toEqual([
      ['1', 120.5],
      ['2', 900],
      ['3', null],
    ]);
  });

  it('warns about a column that the table does not have', () => {
    const chart = getFormulaChartData(
      spending,
      [],
      false,
      { labelColumn: 7, valueColumns: [1, 9] },
      formatLabel,
    );
    expect(chart.labelColumn).toBe(0);
    expect(chart.series.map(series => series.columnIndex)).toEqual([1]);
    expect(chart.warnings).toEqual([
      { kind: 'missing-column', columnIndex: 7 },
      { kind: 'missing-column', columnIndex: 9 },
    ]);
  });

  it('warns when there is no value column', () => {
    const chart = getFormulaChartData(
      [['a'], ['b']],
      [],
      false,
      {},
      formatLabel,
    );
    expect(chart.series).toEqual([]);
    expect(chart.warnings).toEqual([{ kind: 'no-values' }]);
  });

  describe('donut', () => {
    it('shows the first value column only, as sizes, without empty slices', () => {
      const chart = getFormulaChartData(
        [
          ['Food', -120, 1],
          ['Rent', -900, 2],
          ['Gift', 0, 3],
          ['Fun', null, 4],
        ],
        [],
        false,
        { type: 'donut' },
        formatLabel,
      );
      expect(chart.series.map(series => series.columnIndex)).toEqual([1]);
      expect(chart.rows).toEqual([
        { label: 'Food', value0: 120 },
        { label: 'Rent', value0: 900 },
      ]);
      expect(chart.warnings).toEqual([
        { kind: 'donut-first-column', columnIndex: 1 },
      ]);
    });

    it('warns when the values have both signs', () => {
      const chart = getFormulaChartData(
        [
          ['Pay', 3000],
          ['Rent', -900],
        ],
        [],
        false,
        { type: 'donut' },
        formatLabel,
      );
      expect(chart.rows.map(row => row.value0)).toEqual([3000, 900]);
      expect(chart.warnings).toEqual([
        { kind: 'donut-mixed-signs', columnIndex: 1 },
      ]);
    });
  });
});
