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
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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

import type { GraphFormat, GraphItemClickProps } from './graphItem';
import { SeriesTooltip } from './SeriesTooltip';
import { showActivity } from './showActivity';
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
  // Shows the values in place of useFormat
  format?: GraphFormat;
  // Areas in place of lines
  area?: boolean;
  // Areas only: each area stacks on the one before it
  stacked?: boolean;
} & GraphItemClickProps;

// Recharts calls activeDot handlers with the dot's props as the second
// argument, although its types declare a MouseEvent
function getDotIndex(dot: unknown) {
  return typeof dot === 'object' &&
    dot !== null &&
    'index' in dot &&
    typeof dot.index === 'number'
    ? dot.index
    : null;
}

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
  format: formatProp,
  area = false,
  stacked = false,
  onItemClick,
  isItemClickable,
}: LineGraphProps) {
  const animationProps = useRechartsAnimation();
  const navigate = useNavigate();
  const { data: categories = { grouped: [], list: [] } } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const privacyMode = usePrivacyMode();
  const defaultFormat = useFormat();
  const format = formatProp ?? defaultFormat;
  const isStackedArea = area && stacked;

  const [pointer, setPointer] = useState('');
  const [tooltip, setTooltip] = useState('');

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
    >
      {(width, height) =>
        data && (
          <div>
            {!compact && <div style={{ marginTop: '15px' }} />}
            <ComposedChart
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
                      order={isStackedArea ? 'stack' : 'value'}
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
              {/* A stack draws its first series at the top, so the legend
                  order runs top to bottom */}
              {(isStackedArea
                ? data.legend.slice(0).reverse()
                : data.legend
              ).map(entry => {
                const activeDot = {
                  r: entry.dataKey === tooltip && !compact ? 8 : 3,
                  onMouseEnter: (_, dot: unknown) => {
                    setTooltip(entry.dataKey);
                    const index = getDotIndex(dot);
                    const isClickable = onItemClick
                      ? index !== null &&
                        (isItemClickable?.({
                          index,
                          dataKey: entry.dataKey,
                        }) ??
                          true)
                      : groupBy !== 'Interval';
                    if (isClickable) {
                      setPointer('pointer');
                    }
                  },
                  onMouseLeave: () => {
                    setPointer('');
                    setTooltip('');
                  },
                  onClick: (e, payload) => {
                    if (compact && !showTooltip) {
                      return;
                    }
                    if (onItemClick) {
                      const index = getDotIndex(payload);
                      if (index !== null) {
                        onItemClick({ index, dataKey: entry.dataKey });
                      }
                      return;
                    }
                    if (groupBy !== 'Interval') {
                      onShowActivity(
                        entry.id,
                        payload,
                        entry.uncategorizedId,
                        entry.bucketTagNames,
                      );
                    }
                  },
                };
                return area ? (
                  <Area
                    key={entry.dataKey}
                    // Straight, as the area of AreaGraph
                    type="linear"
                    dataKey={entry.dataKey}
                    stackId={stacked ? 'a' : undefined}
                    stroke={entry.color}
                    fill={entry.color}
                    fillOpacity={0.2}
                    {...animationProps}
                    activeDot={activeDot}
                  />
                ) : (
                  <Line
                    key={entry.dataKey}
                    strokeWidth={2}
                    type="monotone"
                    dataKey={entry.dataKey}
                    stroke={entry.color}
                    {...animationProps}
                    activeDot={activeDot}
                  />
                );
              })}
            </ComposedChart>
          </div>
        )
      }
    </Container>
  );
}
