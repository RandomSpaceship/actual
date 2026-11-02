// @ts-strict-ignore
import React, { useState } from 'react';
import type { CSSProperties } from 'react';

import { theme } from '@actual-app/components/theme';
import type {
  balanceTypeOpType,
  DataEntity,
  RuleConditionEntity,
} from '@actual-app/core/types/models';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useRechartsAnimation } from '#components/reports/chart-theme';
import { Container } from '#components/reports/Container';
import { getCustomTick } from '#components/reports/getCustomTick';
import { numberFormatterTooltip } from '#components/reports/numberFormatter';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useNavigate } from '#hooks/useNavigate';
import { usePrivacyMode } from '#hooks/usePrivacyMode';

import { ChartColumns } from './ChartColumns';
import { ChartSelection } from './ChartSelection';
import { readTooltipRow, SeriesTooltip } from './SeriesTooltip';
import { showActivity } from './showActivity';
import { getChartSelectionKey, useChartPress } from './useChartPress';
import { computeTrendLines } from './util/computeTrendLines';

type LineGraphProps = {
  style?: CSSProperties;
  data: DataEntity;
  filters: RuleConditionEntity[];
  groupBy: string;
  compact?: boolean;
  balanceTypeOp: balanceTypeOpType;
  showHiddenCategories?: boolean;
  showOffBudget?: boolean;
  showTrendLines?: boolean;
  showTooltip?: boolean;
  interval?: string;
};

export function LineGraph({
  style,
  data,
  filters,
  groupBy,
  compact,
  balanceTypeOp,
  showHiddenCategories,
  showOffBudget,
  showTrendLines = false,
  showTooltip = true,
  interval,
}: LineGraphProps) {
  const animationProps = useRechartsAnimation();
  const navigate = useNavigate();
  const { data: categories = { grouped: [], list: [] } } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const privacyMode = usePrivacyMode();
  const format = useFormat();

  const [pointer, setPointer] = useState('');
  const [tooltip, setTooltip] = useState('');
  // A tap in a column picks the nearest line. A tap on the selected line
  // and column opens it; any other tap only selects.
  const { onPointerDownCapture, isOpeningClick, onMissedClick } =
    useChartPress();
  const canOpen = groupBy !== 'Interval';

  const largestValue = data.intervalData
    .map(c => c[balanceTypeOp])
    .reduce((acc, cur) => (Math.abs(cur) > Math.abs(acc) ? cur : acc), 0);

  const leftMargin = Math.abs(largestValue) > 1000000 ? 20 : 5;

  const trendLines = showTrendLines
    ? computeTrendLines(data.intervalData, data.legend)
    : [];

  const onShowActivity = (id, payload, uncategorizedId, bucketTagNames) => {
    showActivity({
      navigate,
      categories,
      accounts,
      balanceTypeOp,
      filters,
      showHiddenCategories,
      showOffBudget,
      type: 'time',
      startDate: payload.payload.intervalStartDate,
      endDate: payload.payload.intervalEndDate,
      field: groupBy.toLowerCase(),
      id,
      uncategorizedId,
      bucketTagNames,
      scopeTagNames: data.scopeTagNames,
      interval,
    });
  };

  return (
    <Container
      style={{
        ...style,
        ...(compact && { height: 'auto' }),
      }}
      onTooltipRowTap={
        canOpen && showTooltip
          ? row => {
              const { date, series } = readTooltipRow(row);
              const intervalItem = data.intervalData.find(
                item => item.date === date,
              );
              const entry = data.legend.find(item => item.dataKey === series);
              if (intervalItem && entry) {
                onShowActivity(
                  entry.id,
                  { payload: intervalItem },
                  entry.uncategorizedId,
                  entry.bucketTagNames,
                );
              }
            }
          : undefined
      }
    >
      {(width, height) =>
        data && (
          <div onPointerDownCapture={onPointerDownCapture}>
            {!compact && <div style={{ marginTop: '15px' }} />}
            <LineChart
              responsive
              width={width}
              height={height}
              data={data.intervalData}
              margin={{ top: 10, right: 10, left: leftMargin, bottom: 10 }}
              style={{ cursor: pointer }}
            >
              {showTooltip && (
                <Tooltip
                  content={
                    <SeriesTooltip
                      legend={data.legend}
                      format={format}
                      compact={compact}
                      hoveredKey={tooltip}
                      order="value"
                      canOpenRows={canOpen}
                    />
                  }
                  formatter={numberFormatterTooltip}
                  isAnimationActive={false}
                />
              )}
              {!compact && <CartesianGrid strokeDasharray="3 3" />}
              {!compact && (
                <XAxis
                  dataKey="date"
                  tick={{ fill: theme.pageText }}
                  tickLine={{ stroke: theme.pageText }}
                />
              )}
              {!compact && (
                <YAxis
                  tickFormatter={value =>
                    getCustomTick(
                      format(value, 'financial-no-decimals'),
                      privacyMode,
                    )
                  }
                  tick={{ fill: theme.pageText }}
                  tickLine={{ stroke: theme.pageText }}
                  tickSize={0}
                />
              )}
              {trendLines.map(t => (
                <ReferenceLine
                  key={`trend-${t.id}`}
                  segment={[t.start, t.end]}
                  stroke={t.color}
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  ifOverflow="extendDomain"
                />
              ))}
              <ChartSelection data={data.intervalData} series={tooltip} />
              {data.legend.map((entry, index) => {
                return (
                  <Line
                    key={index}
                    strokeWidth={2}
                    type="monotone"
                    dataKey={entry.dataKey}
                    stroke={entry.color}
                    {...animationProps}
                    activeDot={{
                      r: entry.dataKey === tooltip && !compact ? 8 : 3,
                    }}
                  />
                );
              })}
              <ChartColumns
                data={data.intervalData}
                series={data.legend.map(entry => entry.dataKey)}
                onMouseEnter={() => canOpen && setPointer('pointer')}
                onMouseLeave={() => {
                  setPointer('');
                  setTooltip('');
                }}
                onMove={(_index, series) => setTooltip(series ?? '')}
                onClick={(index, series, event) => {
                  if (!series) {
                    setTooltip('');
                    onMissedClick(event);
                    return;
                  }
                  const entry = data.legend.find(
                    item => item.dataKey === series,
                  );
                  if (
                    entry &&
                    ((compact && showTooltip) || !compact) &&
                    canOpen &&
                    isOpeningClick(
                      getChartSelectionKey(index, series),
                      event,
                      showTooltip,
                    )
                  ) {
                    onShowActivity(
                      entry.id,
                      { payload: data.intervalData[index] },
                      entry.uncategorizedId,
                      entry.bucketTagNames,
                    );
                  } else {
                    setTooltip(series);
                  }
                }}
              />
            </LineChart>
          </div>
        )
      }
    </Container>
  );
}
