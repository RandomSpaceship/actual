import type { FormulaChartSettings } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import type { FormulaTable } from './executeFormula';
import { getFormulaChartData } from './formulaChartData';
import { getFormulaGraph } from './formulaGraphData';

const formatLabel = (value: unknown) => String(value);

function graphOf(
  table: FormulaTable,
  settings: FormulaChartSettings,
  columns = [{}, {}, {}],
) {
  return getFormulaGraph(
    getFormulaChartData(table, columns, false, settings, formatLabel),
  );
}

const spending: FormulaTable = [
  ['Food', -120.5, 4],
  ['Rent', -900, 1],
];

describe('getFormulaGraph', () => {
  it('draws one money series as a bar graph with a color for each bar', () => {
    const graph = graphOf(spending, { type: 'bar' }, [
      {},
      {},
      { chartRole: 'hidden' },
    ]);
    expect(graph.graphType).toBe('BarGraph');
    expect(graph.valueType).toBe('money');
    expect(graph.seriesName).toBe('Value');
    // Money is an integer amount, as in a custom report
    expect(graph.data.data?.map(item => [item.name, item.totalTotals])).toEqual(
      [
        ['Food', -12050],
        ['Rent', -90000],
      ],
    );
    expect(graph.data.legend?.map(entry => entry.dataKey)).toEqual([
      'row0',
      'row1',
    ]);
    expect(graph.getCells({ index: 1 })).toEqual([
      { rowIndex: 1, columnIndex: 1 },
    ]);
  });

  it('draws more than one series as stacked bars with a legend entry for each series', () => {
    const graph = graphOf(spending, { type: 'bar', stacked: true }, [
      {},
      {},
      { type: 'number', name: 'Count' },
    ]);
    expect(graph.graphType).toBe('StackedBarGraph');
    expect(graph.isStacked).toBe(true);
    expect(
      graph.data.legend?.map(entry => [entry.dataKey, entry.name]),
    ).toEqual([
      ['value0', 'Column 2'],
      ['value1', 'Count'],
    ]);
    // All values use the format of the first series
    expect(graph.data.intervalData[0]).toMatchObject({
      date: 'Food',
      value0: -12050,
      value1: 400,
    });
    expect(graph.getCells({ index: 0, dataKey: 'value1' })).toEqual([
      { rowIndex: 0, columnIndex: 2 },
    ]);
  });

  it('keeps a number series as it is', () => {
    const graph = graphOf(
      [
        ['Jan', 3],
        ['Feb', 5],
      ],
      { type: 'line' },
      [{}, { type: 'number' }],
    );
    expect(graph.graphType).toBe('LineGraph');
    expect(graph.isArea).toBe(false);
    expect(graph.data.intervalData).toMatchObject([
      { date: 'Jan', value0: 3 },
      { date: 'Feb', value0: 5 },
    ]);
  });

  it('draws one area series as an area graph and more as areas of a line graph', () => {
    expect(
      graphOf(spending, { type: 'area' }, [{}, {}, { chartRole: 'hidden' }])
        .graphType,
    ).toBe('AreaGraph');
    const graph = graphOf(spending, { type: 'area' }, [
      {},
      {},
      { type: 'money' },
    ]);
    expect(graph.graphType).toBe('LineGraph');
    expect(graph.isArea).toBe(true);
  });

  it('gives a two-ring donut the groups as the inner ring', () => {
    const graph = graphOf(
      [
        ['Bills', 'Rent', -900],
        ['Food', 'Groceries', -100],
        ['Bills', 'Power', -50],
      ],
      { type: 'donut' },
      [{}, { chartRole: 'series' }, {}],
    );
    expect(graph.graphType).toBe('DonutGraph');
    expect(graph.groupBy).toBe('CategoryGroup');
    expect(
      graph.data.groupedData?.map(group => [
        group.name,
        group.totalTotals,
        group.categories?.map(category => category.name),
      ]),
    ).toEqual([
      ['Bills', 95000, ['Rent', 'Power']],
      ['Food', 10000, ['Groceries']],
    ]);
    // The outer ring is in group order
    expect(graph.getCells({ index: 1, ring: 'item' })).toEqual([
      { rowIndex: 2, columnIndex: 2 },
    ]);
    expect(graph.getCells({ index: 0, ring: 'group' })).toEqual([
      { rowIndex: 0, columnIndex: 2 },
      { rowIndex: 2, columnIndex: 2 },
    ]);
  });
});
