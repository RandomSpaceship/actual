import React from 'react';

import { useActiveTooltipDataPoints, useIsTooltipActive } from 'recharts';

import { getChartSelectionKey } from './useChartPress';

type ChartSelectionProps = {
  // The chart's data, which the tooltip's points are found in
  data: readonly unknown[];
  // The selected series, on charts with several
  series?: string;
};

/**
 * Marks a cartesian chart's selected column (and series) for useChartPress.
 * Must be drawn inside the chart.
 */
export function ChartSelection({ data, series }: ChartSelectionProps) {
  const isTooltipActive = useIsTooltipActive();
  const points = useActiveTooltipDataPoints();
  const index =
    isTooltipActive && points?.length ? data.indexOf(points[0]) : -1;
  if (index === -1) {
    return null;
  }
  return <g data-chart-selected={getChartSelectionKey(index, series)} />;
}
