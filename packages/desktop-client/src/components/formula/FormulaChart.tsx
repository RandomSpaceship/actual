import { useTranslation } from 'react-i18next';

import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { amountToInteger } from '@actual-app/core/shared/util';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  getColorScale,
  useRechartsAnimation,
} from '#components/reports/chart-theme';
import { Container } from '#components/reports/Container';
import { getCustomTick } from '#components/reports/getCustomTick';
import { useFormat } from '#hooks/useFormat';
import { usePrivacyMode } from '#hooks/usePrivacyMode';

import { useFormulaValueFormatter } from './formatFormulaValue';
import { noSeriesColumn } from './formulaChartData';
import type { FormulaChartData, FormulaChartRow } from './formulaChartData';
import { FormulaChartTooltip } from './FormulaChartTooltip';
import { FormulaDonutChart } from './FormulaDonutChart';
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

// Draws a chart from the rows of a table result. Each value shows in the
// format of its column. A click on a bar, a point or a slice opens its
// transactions, when the source map has them.
export function FormulaChart({
  chart,
  sourceMap = null,
  compact = false,
  style,
}: FormulaChartProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const formatFormulaValue = useFormulaValueFormatter();
  const privacyMode = usePrivacyMode();
  const animationProps = useRechartsAnimation();
  const colors = getColorScale('qualitative');
  const { type, series, rows } = chart;
  const stackId = chart.stacked ? 'stack' : undefined;
  const transactions = useFormulaTransactions(sourceMap);
  const getRowCells = (rowIndex: number, seriesKey: string) =>
    chart.rowCells[rowIndex]?.[seriesKey];
  // The props of the dot under the pointer of a line or an area
  const getDotCells = (dot: unknown, seriesKey: string) =>
    typeof dot === 'object' &&
    dot !== null &&
    'index' in dot &&
    typeof dot.index === 'number'
      ? getRowCells(dot.index, seriesKey)
      : undefined;
  const getActiveDot = (seriesKey: string) => ({
    onMouseEnter: (_: unknown, dot: unknown) =>
      transactions.hoverCells(getDotCells(dot, seriesKey)),
    onMouseLeave: () => transactions.hoverCells(undefined),
    onClick: (_: unknown, dot: unknown) =>
      transactions.openCells(getDotCells(dot, seriesKey)),
  });

  const seriesNames = series.map(
    oneSeries =>
      oneSeries.name ||
      (series.length === 1
        ? t('Value')
        : t('Column {{columnNumber}}', {
            columnNumber: oneSeries.columnIndex + 1,
          })),
  );
  // The axis has one format, so it uses the format of the first series
  const axisType = series[0]?.type ?? 'money';

  function formatTick(value: number) {
    if (axisType === 'money') {
      return getCustomTick(
        format(amountToInteger(value), 'financial-no-decimals'),
        privacyMode,
      );
    }
    return formatFormulaValue(value, axisType);
  }

  const tooltip = (
    <Tooltip
      cursor={type === 'bar' ? { fill: 'transparent' } : true}
      isAnimationActive={false}
      content={({ active, payload }) => {
        const row = payload?.[0]?.payload as FormulaChartRow | undefined;
        if (!active || !row) return null;
        return (
          <FormulaChartTooltip
            row={row}
            series={series.map((oneSeries, seriesIndex) => ({
              key: oneSeries.key,
              name: seriesNames[seriesIndex],
              type: oneSeries.type,
            }))}
            formatValue={formatFormulaValue}
            hideEmptyValues={chart.seriesColumn !== noSeriesColumn}
          />
        );
      }}
    />
  );

  const axes = !compact && (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="label"
        tick={{ fill: theme.pageText }}
        tickLine={{ stroke: theme.pageText }}
      />
      <YAxis
        tickFormatter={formatTick}
        tick={{ fill: theme.pageText }}
        tickLine={{ stroke: theme.pageText }}
        tickSize={0}
      />
      <ReferenceLine y={0} stroke={theme.pageTextLight} />
    </>
  );
  const legend = !compact && series.length > 1 && (
    <Legend
      itemSorter={null}
      formatter={(_, entry) =>
        seriesNames[series.findIndex(item => item.key === entry.dataKey)]
      }
    />
  );
  const margin = { top: 10, right: 10, left: compact ? 10 : 20, bottom: 10 };

  return (
    <View
      style={{
        flex: 1,
        cursor: transactions.isOverItem ? 'pointer' : undefined,
      }}
      onPointerDown={transactions.onPointerDown}
    >
      <Container style={{ height: 'auto', flex: 1, ...style }}>
        {(width, height) => {
          if (type === 'donut') {
            return (
              <FormulaDonutChart
                chart={chart}
                compact={compact}
                width={width}
                height={height}
                tooltip={tooltip}
                onHoverCells={transactions.hoverCells}
                onOpenCells={transactions.openCells}
              />
            );
          }

          if (type === 'line') {
            return (
              <LineChart
                width={width}
                height={height}
                data={rows}
                margin={margin}
              >
                {tooltip}
                {axes}
                {legend}
                {series.map((oneSeries, seriesIndex) => (
                  <Line
                    key={oneSeries.key}
                    dataKey={oneSeries.key}
                    type="monotone"
                    strokeWidth={2}
                    stroke={colors[seriesIndex % colors.length]}
                    dot={!compact}
                    activeDot={getActiveDot(oneSeries.key)}
                    {...animationProps}
                  />
                ))}
              </LineChart>
            );
          }

          if (type === 'area') {
            return (
              <AreaChart
                width={width}
                height={height}
                data={rows}
                margin={margin}
              >
                {tooltip}
                {axes}
                {legend}
                {series.map((oneSeries, seriesIndex) => (
                  <Area
                    key={oneSeries.key}
                    dataKey={oneSeries.key}
                    stackId={stackId}
                    type="linear"
                    stroke={colors[seriesIndex % colors.length]}
                    fill={colors[seriesIndex % colors.length]}
                    fillOpacity={0.2}
                    activeDot={getActiveDot(oneSeries.key)}
                    {...animationProps}
                  />
                ))}
              </AreaChart>
            );
          }

          return (
            <BarChart
              width={width}
              height={height}
              data={rows}
              margin={margin}
              // A negative value stacks down from 0, so it does not cancel a
              // positive value
              stackOffset="sign"
            >
              {tooltip}
              {axes}
              {legend}
              {series.map((oneSeries, seriesIndex) => (
                <Bar
                  key={oneSeries.key}
                  dataKey={oneSeries.key}
                  stackId={stackId}
                  fill={colors[seriesIndex % colors.length]}
                  onMouseEnter={(_, rowIndex) =>
                    transactions.hoverCells(
                      getRowCells(rowIndex, oneSeries.key),
                    )
                  }
                  onMouseLeave={() => transactions.hoverCells(undefined)}
                  onClick={(_, rowIndex) =>
                    transactions.openCells(getRowCells(rowIndex, oneSeries.key))
                  }
                  {...animationProps}
                />
              ))}
            </BarChart>
          );
        }}
      </Container>
    </View>
  );
}
