import type { CSSProperties } from '@actual-app/components/styles';
import { View } from '@actual-app/components/view';
import type { balanceTypeOpType } from '@actual-app/core/types/models';

import { AreaGraph } from '#components/reports/graphs/AreaGraph';
import { BarGraph } from '#components/reports/graphs/BarGraph';
import { DonutGraph } from '#components/reports/graphs/DonutGraph';
import type {
  GraphFormat,
  GraphItemClickProps,
} from '#components/reports/graphs/graphItem';
import { LineGraph } from '#components/reports/graphs/LineGraph';
import { StackedBarGraph } from '#components/reports/graphs/StackedBarGraph';

import { useFormulaValueFormatter } from './formatFormulaValue';
import type { FormulaChartData } from './formulaChartData';
import { getFormulaGraph } from './formulaGraphData';
import type { FormulaSourceMap } from './formulaSourceMap';
import { useFormulaTransactions } from './useFormulaTransactions';

type FormulaChartProps = {
  chart: FormulaChartData;
  // The transactions of the table cells. Without it, a chart item does not
  // open its transactions.
  sourceMap?: FormulaSourceMap | null;
  // A dashboard card: no axes, no grid and no legend, as the custom report
  // graphs on a card
  compact?: boolean;
  style?: CSSProperties;
};

// Draws a chart from the rows of a table result with the custom report
// graphs. A click on a bar, a point or a slice opens its transactions, when
// the source map has them.
export function FormulaChart({
  chart,
  sourceMap = null,
  compact = false,
  style,
}: FormulaChartProps) {
  const formatFormulaValue = useFormulaValueFormatter();
  const transactions = useFormulaTransactions(sourceMap);
  const graph = getFormulaGraph(chart);

  // A money value is an integer amount, so the format of the graphs shows it
  const format: GraphFormat | undefined =
    graph.valueType === 'money'
      ? undefined
      : value =>
          formatFormulaValue(
            typeof value === 'number' ? value : null,
            graph.valueType,
          );
  // Always given, so that a graph never opens the transactions of a custom
  // report
  const clickProps: GraphItemClickProps = {
    onItemClick: item => transactions.openCells(graph.getCells(item)),
    isItemClickable: item => transactions.isClickable(graph.getCells(item)),
  };
  // Each item holds its value in its totals
  const balanceTypeOp: balanceTypeOpType = 'totalTotals';
  const graphProps = {
    style: { height: 'auto', flex: 1, ...style },
    data: graph.data,
    filters: [],
    groupBy: graph.groupBy,
    balanceTypeOp,
    compact,
    viewLabels: false,
    format,
    ...clickProps,
  };

  return (
    <View style={{ flex: 1 }} onPointerDown={transactions.onPointerDown}>
      {graph.graphType === 'BarGraph' && (
        <BarGraph {...graphProps} seriesName={graph.seriesName} />
      )}
      {graph.graphType === 'AreaGraph' && (
        <AreaGraph {...graphProps} seriesName={graph.seriesName} />
      )}
      {graph.graphType === 'StackedBarGraph' && (
        <StackedBarGraph {...graphProps} stacked={graph.isStacked} />
      )}
      {graph.graphType === 'LineGraph' && (
        <LineGraph
          {...graphProps}
          area={graph.isArea}
          stacked={graph.isStacked}
        />
      )}
      {graph.graphType === 'DonutGraph' && <DonutGraph {...graphProps} />}
    </View>
  );
}
