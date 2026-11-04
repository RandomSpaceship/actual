import type { ReactNode } from 'react';

import { Legend, Pie, PieChart } from 'recharts';

import {
  getColorScale,
  useRechartsAnimation,
} from '#components/reports/chart-theme';

import type {
  FormulaChartData,
  FormulaChartRow,
  FormulaChartRowCells,
  FormulaTableCellPosition,
} from './formulaChartData';

type FormulaDonutChartProps = {
  chart: FormulaChartData;
  compact: boolean;
  width: number;
  height: number;
  // The Tooltip element of the chart
  tooltip: ReactNode;
  // The table cells of the slice under the pointer, or undefined
  onHoverCells: (cells: FormulaTableCellPosition[] | undefined) => void;
  onOpenCells: (cells: FormulaTableCellPosition[] | undefined) => void;
};

// The ring sizes of the custom report donut, as parts of the outer radius
const innerRingStart = 0.48;
const outerRingStart = 0.74;

// One ring, or two rings when the chart has groups. The inner ring shows the
// groups, and the outer ring shows the slices of each group in lighter steps
// of the group colour.
export function FormulaDonutChart({
  chart,
  compact,
  width,
  height,
  tooltip,
  onHoverCells,
  onOpenCells,
}: FormulaDonutChartProps) {
  const animationProps = useRechartsAnimation();
  const colors = getColorScale('qualitative');
  const [valueSeries] = chart.series;
  if (!valueSeries) return null;

  // The legend under the donut names the slices, or the groups
  const legendHeight = compact ? 0 : 40;
  const radius = Math.min(width, height - legendHeight) / 2 - 10;
  const ringProps = {
    dataKey: valueSeries.key,
    nameKey: 'label',
    startAngle: 90,
    endAngle: -270,
    ...animationProps,
  };
  // In row order, not A to Z
  const legend = !compact && <Legend itemSorter={null} />;
  // The slices of a ring are its rows, in order
  const getCellProps = (ringCells: FormulaChartRowCells[] | undefined) => {
    const getCells = (sliceIndex: number) =>
      ringCells?.[sliceIndex]?.[valueSeries.key];
    return {
      onMouseEnter: (_: unknown, sliceIndex: number) =>
        onHoverCells(getCells(sliceIndex)),
      onMouseLeave: () => onHoverCells(undefined),
      onClick: (_: unknown, sliceIndex: number) =>
        onOpenCells(getCells(sliceIndex)),
    };
  };

  if (!chart.groups) {
    return (
      <PieChart width={width} height={height}>
        {tooltip}
        {legend}
        <Pie
          {...ringProps}
          // Recharts takes the colour of a slice and its legend item from
          // the fill of the row
          data={chart.rows.map((row, rowIndex) => ({
            ...row,
            fill: colors[rowIndex % colors.length],
          }))}
          innerRadius={radius * 0.5}
          outerRadius={radius}
          {...getCellProps(chart.rowCells)}
        />
      </PieChart>
    );
  }

  const colorOfGroup = new Map(
    chart.groups.map((group, groupIndex) => [
      group.label,
      colors[groupIndex % colors.length],
    ]),
  );

  return (
    <PieChart width={width} height={height}>
      {tooltip}
      {legend}
      <Pie
        {...ringProps}
        data={chart.groups.map(group => ({
          ...group,
          fill: colorOfGroup.get(group.label),
        }))}
        innerRadius={radius * innerRingStart}
        outerRadius={radius * outerRingStart}
        {...getCellProps(chart.groupCells)}
      />
      <Pie
        {...ringProps}
        // The legend shows the groups only
        legendType="none"
        data={getOuterSlices(chart.rows, colorOfGroup)}
        innerRadius={radius * outerRingStart}
        outerRadius={radius}
        {...getCellProps(chart.rowCells)}
      />
    </PieChart>
  );
}

// The first slice of a group has the group colour, and each next slice is
// lighter, as in the custom report donut
function getOuterSlices(
  rows: FormulaChartRow[],
  colorOfGroup: Map<string, string>,
) {
  const sliceCountOfGroup = new Map<string, number>();
  for (const row of rows) {
    const group = String(row.group);
    sliceCountOfGroup.set(group, (sliceCountOfGroup.get(group) ?? 0) + 1);
  }
  const sliceIndexOfGroup = new Map<string, number>();
  return rows.map(row => {
    const group = String(row.group);
    const sliceIndex = sliceIndexOfGroup.get(group) ?? 0;
    sliceIndexOfGroup.set(group, sliceIndex + 1);
    const sliceCount = sliceCountOfGroup.get(group) ?? 1;
    return {
      ...row,
      fill: colorOfGroup.get(group),
      fillOpacity: 1 - (sliceIndex / sliceCount) * 0.6,
    };
  });
}
