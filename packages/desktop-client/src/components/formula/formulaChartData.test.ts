import { describe, expect, it } from 'vitest';

import type { FormulaTable } from './executeFormula';
import {
  getFormulaChartData,
  manySeriesLimit,
  noSeriesColumn,
  rowNumberLabelColumn,
} from './formulaChartData';

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

  describe('long table', () => {
    // As QUERY_GROUP("q", "month", "category") gives
    const monthsByCategory: FormulaTable = [
      ['2024-01', 'Food', -100],
      ['2024-01', 'Rent', -900],
      ['2024-02', 'Food', -50],
      ['2024-02', 'Food', -5],
    ];

    it('uses the second text column as the series column', () => {
      const chart = getFormulaChartData(
        monthsByCategory,
        [{ type: 'date' }],
        false,
        {},
        formatLabel,
      );
      expect(chart.labelColumn).toBe(0);
      expect(chart.seriesColumn).toBe(1);
      expect(chart.series).toEqual([
        { key: 'value0', columnIndex: 2, name: 'Food', type: 'money' },
        { key: 'value1', columnIndex: 2, name: 'Rent', type: 'money' },
      ]);
      // A missing pair gives 0, and a duplicate pair adds up
      expect(chart.rows).toEqual([
        { label: 'date:2024-01', value0: -100, value1: -900 },
        { label: 'date:2024-02', value0: -55, value1: 0 },
      ]);
      expect(chart.warnings).toEqual([]);
    });

    it('does not use a series column when each label shows one time', () => {
      const chart = getFormulaChartData(
        [
          ['Food', 'weekly shop', -100],
          ['Rent', 'monthly', -900],
        ],
        [],
        false,
        {},
        formatLabel,
      );
      expect(chart.seriesColumn).toBe(noSeriesColumn);
      expect(chart.rows).toEqual([
        { label: 'Food', value0: -100 },
        { label: 'Rent', value0: -900 },
      ]);
    });

    it('stacks a bar or area chart only', () => {
      const getStacked = (type: 'bar' | 'area' | 'line') =>
        getFormulaChartData(
          monthsByCategory,
          [],
          false,
          { type, stacked: true },
          formatLabel,
        ).stacked;
      expect([
        getStacked('bar'),
        getStacked('area'),
        getStacked('line'),
      ]).toEqual([true, true, false]);
    });

    it('uses no series column when the settings say so', () => {
      const chart = getFormulaChartData(
        monthsByCategory,
        [],
        false,
        { seriesColumn: noSeriesColumn },
        formatLabel,
      );
      expect(chart.seriesColumn).toBe(noSeriesColumn);
      expect(chart.rows).toHaveLength(4);
    });

    it('shows only the first value column, and flips the signs', () => {
      const chart = getFormulaChartData(
        [
          ['Jan', 'Food', -1, -2],
          ['Jan', 'Rent', -3, -4],
        ],
        [],
        false,
        { flipSign: true },
        formatLabel,
      );
      expect(chart.rows).toEqual([{ label: 'Jan', value0: 1, value1: 3 }]);
      expect(chart.warnings).toEqual([
        { kind: 'series-first-column', columnIndex: 2 },
      ]);
    });

    it('warns about many series', () => {
      const count = manySeriesLimit + 1;
      const chart = getFormulaChartData(
        Array.from({ length: count }, (_, index) => ['Jan', `c${index}`, 1]),
        [],
        false,
        {},
        formatLabel,
      );
      expect(chart.series).toHaveLength(count);
      expect(chart.warnings).toEqual([{ kind: 'many-series', count }]);
    });

    it('gives a donut two rings that agree', () => {
      // As QUERY_GROUP("q", "category group", "category") gives
      const chart = getFormulaChartData(
        [
          ['Bills', 'Rent', -900],
          ['Food', 'Groceries', -100],
          ['Bills', 'Power', -50],
          ['Food', 'Eating out', 0],
          ['Bills', 'Refund', 20],
        ],
        [],
        false,
        { type: 'donut' },
        formatLabel,
      );
      // In group order, without empty slices, as sizes
      expect(chart.rows).toEqual([
        { label: 'Rent', group: 'Bills', value0: 900 },
        { label: 'Power', group: 'Bills', value0: 50 },
        { label: 'Refund', group: 'Bills', value0: 20 },
        { label: 'Groceries', group: 'Food', value0: 100 },
      ]);
      expect(chart.groups).toEqual([
        { label: 'Bills', value0: 970 },
        { label: 'Food', value0: 100 },
      ]);
      expect(chart.warnings).toEqual([
        { kind: 'donut-mixed-signs', columnIndex: 2 },
      ]);
    });
  });
});
