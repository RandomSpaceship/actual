import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  DataEntity,
  FormulaTableColumnType,
  GroupedEntity,
  IntervalEntity,
  LegendEntity,
} from '@actual-app/core/types/models';
import { t } from 'i18next';

import { getColorScale } from '#components/reports/chart-theme';
import type { GraphItem } from '#components/reports/graphs/graphItem';

import { noSeriesColumn } from './formulaChartData';
import type {
  FormulaChartData,
  FormulaChartRow,
  FormulaChartSeries,
  FormulaTableCellPosition,
} from './formulaChartData';

export type FormulaGraphType =
  | 'BarGraph'
  | 'StackedBarGraph'
  | 'LineGraph'
  | 'AreaGraph'
  | 'DonutGraph';

// The props of a custom report graph for a formula chart
export type FormulaGraph = {
  graphType: FormulaGraphType;
  data: DataEntity;
  // CategoryGroup gives the two-ring donut
  groupBy: 'Category' | 'CategoryGroup';
  // The values of all series show in the format of this type. A money value
  // is an integer amount, as in a custom report.
  valueType: FormulaTableColumnType;
  // The name of the value in the tooltip of a graph with one series
  seriesName: string;
  // LineGraph only: areas in place of lines
  isArea: boolean;
  // StackedBarGraph and LineGraph only
  isStacked: boolean;
  // The table cells of a graph item. undefined: the item has no cells.
  getCells: (item: GraphItem) => FormulaTableCellPosition[] | undefined;
};

// Makes the data of a custom report graph from the rows of a formula chart.
// Each value is also in the totals of its row, because some graphs show the
// total of a row (balanceTypeOp 'totalTotals').
export function getFormulaGraph(chart: FormulaChartData): FormulaGraph {
  const { series, rows } = chart;
  const valueType = series[0]?.type ?? 'money';
  const toGraphValue = (value: FormulaChartRow[string] | undefined) => {
    if (typeof value !== 'number') return null;
    return valueType === 'money' ? amountToInteger(value) : value;
  };
  const seriesNames = series.map(oneSeries =>
    getSeriesName(oneSeries, series.length),
  );
  const [firstSeries] = series;
  const firstKey = firstSeries?.key ?? '';
  const colors = getColorScale('qualitative');
  const getColor = (index: number) => colors[index % colors.length];
  const getRowCells = (index: number, key: string | undefined) =>
    key === undefined ? undefined : chart.rowCells[index]?.[key];

  const intervalData = rows.map((row): IntervalEntity => {
    const values = series.map(oneSeries => toGraphValue(row[oneSeries.key]));
    return {
      date: row.label,
      ...getTotals(values),
      ...Object.fromEntries(
        series.map((oneSeries, index) => [oneSeries.key, values[index]]),
      ),
    };
  });
  const toGroupedEntity = (
    row: FormulaChartRow,
    id: string,
    categories?: GroupedEntity[],
  ): GroupedEntity => ({
    id,
    name: row.label,
    intervalData: [],
    ...getTotals([toGraphValue(row[firstKey])]),
    ...(categories && { categories }),
  });
  const base = {
    valueType,
    seriesName: seriesNames[0] ?? '',
    isArea: false,
    isStacked: chart.stacked,
  };
  const rowItems = rows.map((row, index) =>
    toGroupedEntity(row, `row${index}`),
  );

  if (chart.type === 'donut' && chart.groups) {
    const groupIndexes = new Map(
      chart.groups.map((group, index) => [group.label, index]),
    );
    const groupedData = chart.groups.map((group, groupIndex) =>
      toGroupedEntity(
        group,
        `group${groupIndex}`,
        rowItems.filter(
          (_, rowIndex) =>
            groupIndexes.get(String(rows[rowIndex].group)) === groupIndex,
        ),
      ),
    );
    const groupCells = chart.groupCells ?? [];
    return {
      ...base,
      graphType: 'DonutGraph',
      groupBy: 'CategoryGroup',
      data: toDataEntity({
        intervalData,
        data: rowItems,
        groupedData,
        legend: groupedData.map((group, index) =>
          toLegendEntity(group.id, group.name, getColor(index)),
        ),
      }),
      getCells: item =>
        item.ring === 'group'
          ? groupCells[item.index]?.[firstKey]
          : getRowCells(item.index, firstKey),
    };
  }

  // One item for each row, with its own color
  const rowLegend = rowItems.map((item, index) =>
    toLegendEntity(item.id, item.name, getColor(index)),
  );
  const hasOneSeries =
    series.length === 1 && chart.seriesColumn === noSeriesColumn;
  if (
    chart.type === 'donut' ||
    (hasOneSeries && (chart.type === 'bar' || chart.type === 'area'))
  ) {
    return {
      ...base,
      graphType:
        chart.type === 'donut'
          ? 'DonutGraph'
          : chart.type === 'bar'
            ? 'BarGraph'
            : 'AreaGraph',
      groupBy: 'Category',
      data: toDataEntity({ intervalData, data: rowItems, legend: rowLegend }),
      getCells: item => getRowCells(item.index, firstKey),
    };
  }

  // One legend entry for each series
  return {
    ...base,
    graphType: chart.type === 'bar' ? 'StackedBarGraph' : 'LineGraph',
    groupBy: 'Category',
    isArea: chart.type === 'area',
    data: toDataEntity({
      intervalData,
      legend: series.map((oneSeries, index) =>
        toLegendEntity(oneSeries.key, seriesNames[index], getColor(index)),
      ),
    }),
    getCells: item => getRowCells(item.index, item.dataKey),
  };
}

// The name of a column without a name is its number. A chart with one value
// column calls it "Value".
function getSeriesName(series: FormulaChartSeries, seriesCount: number) {
  if (series.name) return series.name;
  return seriesCount === 1
    ? t('Value')
    : t('Column {{columnNumber}}', { columnNumber: series.columnIndex + 1 });
}

function toLegendEntity(id: string, name: string, color: string): LegendEntity {
  return { id, name, color, dataKey: id };
}

function toDataEntity(
  parts: Pick<DataEntity, 'intervalData' | 'data' | 'groupedData' | 'legend'>,
): DataEntity {
  return {
    ...parts,
    ...getTotals(parts.intervalData.map(row => row.totalTotals)),
  };
}

// A value that is not a number adds 0
function getTotals(values: Array<number | null>) {
  const numbers = values.filter(value => value !== null);
  const totalAssets = numbers
    .filter(value => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const totalDebts = numbers
    .filter(value => value < 0)
    .reduce((sum, value) => sum + value, 0);
  const totalTotals = totalAssets + totalDebts;
  return {
    totalAssets,
    totalDebts,
    totalTotals,
    netAssets: Math.max(totalTotals, 0),
    netDebts: Math.min(totalTotals, 0),
    totalBudgeted: 0,
  };
}
