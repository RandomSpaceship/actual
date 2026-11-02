// @ts-strict-ignore
import React, { useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';

import { theme } from '@actual-app/components/theme';
import type {
  balanceTypeOpType,
  DataEntity,
  LegendEntity,
  RuleConditionEntity,
} from '@actual-app/core/types/models';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BarShapeProps } from 'recharts';

import { useRechartsAnimation } from '#components/reports/chart-theme';
import { Container } from '#components/reports/Container';
import { getCustomTick } from '#components/reports/getCustomTick';
import { numberFormatterTooltip } from '#components/reports/numberFormatter';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useNavigate } from '#hooks/useNavigate';
import { usePrivacyMode } from '#hooks/usePrivacyMode';

import { ChartSelection } from './ChartSelection';
import { renderCustomLabel } from './renderCustomLabel';
import { readTooltipRow, SeriesTooltip } from './SeriesTooltip';
import { showActivity } from './showActivity';
import { getChartSelectionKey, useChartPress } from './useChartPress';

const customLabel = props => {
  const calcX = props.x + props.width / 2;
  const calcY = props.y + props.height / 2;
  const textAnchor = 'middle';
  const display =
    props.value && `${props.format(props.value, 'financial-no-decimals')}`;
  const textSize = '12px';
  const showLabel = props.height;
  const showLabelThreshold = 20;
  const fill = theme.reportsInnerLabel;

  return renderCustomLabel(
    calcX,
    calcY,
    textAnchor,
    display,
    textSize,
    showLabel,
    showLabelThreshold,
    fill,
  );
};

type StackedBarGraphProps = {
  style?: CSSProperties;
  data: DataEntity;
  filters: RuleConditionEntity[];
  groupBy: string;
  compact?: boolean;
  viewLabels: boolean;
  balanceTypeOp: balanceTypeOpType;
  showHiddenCategories?: boolean;
  showOffBudget?: boolean;
  showTooltip?: boolean;
  interval?: string;
};

export function StackedBarGraph({
  style,
  data,
  filters,
  groupBy,
  compact,
  viewLabels,
  balanceTypeOp,
  showHiddenCategories,
  showOffBudget,
  showTooltip = true,
  interval,
}: StackedBarGraphProps) {
  const animationProps = useRechartsAnimation();
  const navigate = useNavigate();
  const { data: categories = { grouped: [], list: [] } } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const privacyMode = usePrivacyMode();
  const format = useFormat();

  const customLabelWithFormat = props => customLabel({ ...props, format });

  const [pointer, setPointer] = useState('');
  const [tooltip, setTooltip] = useState('');
  // A tap on the selected segment opens it; a tap on any other segment,
  // even in the same column, only selects it
  const { onPointerDownCapture, isOpeningClick, onMissedClick } =
    useChartPress();
  const canOpen = groupBy !== 'Interval';

  const onSegmentClick = (
    index: number,
    series: string,
    event: MouseEvent<Element>,
    segment?: Element,
  ) => {
    const entry = data.legend.find(item => item.dataKey === series);
    if (
      !entry ||
      (compact && !showTooltip) ||
      !canOpen ||
      !isOpeningClick(
        getChartSelectionKey(index, series),
        event,
        showTooltip,
        segment,
      )
    ) {
      setTooltip(series);
      return;
    }
    openSegment(index, entry);
  };

  const openSegment = (index: number, entry: LegendEntity) => {
    const intervalItem = data.intervalData[index];
    showActivity({
      navigate,
      categories,
      accounts,
      balanceTypeOp,
      filters,
      showHiddenCategories,
      showOffBudget,
      type: 'time',
      startDate: intervalItem?.intervalStartDate,
      endDate: intervalItem?.intervalEndDate,
      field: groupBy.toLowerCase(),
      id: entry.id,
      uncategorizedId: entry.uncategorizedId,
      bucketTagNames: entry.bucketTagNames,
      scopeTagNames: data.scopeTagNames,
      interval,
    });
  };

  const largestValue = data.intervalData
    .map(c => c[balanceTypeOp])
    .reduce((acc, cur) => (Math.abs(cur) > Math.abs(acc) ? cur : acc), 0);

  const leftMargin = Math.abs(largestValue) > 1000000 ? 20 : 0;

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
              const index = data.intervalData.findIndex(
                item => item.date === date,
              );
              const entry = data.legend.find(item => item.dataKey === series);
              if (index !== -1 && entry) {
                openSegment(index, entry);
              }
            }
          : undefined
      }
    >
      {(width, height) =>
        data.intervalData && (
          <div
            // Only catches pointer taps beside the segments; the chart has
            // its own keyboard support
            role="presentation"
            onPointerDownCapture={onPointerDownCapture}
            // While a finger scrubs, the segment nearest it is selected
            onTouchMove={event => {
              const touch = event.touches[0];
              const segment =
                touch &&
                findNearestSegment(
                  event.currentTarget,
                  touch.clientX,
                  touch.clientY,
                  Infinity,
                );
              if (segment) {
                setTooltip(segment.series);
              }
            }}
            // A click beside the segments picks the nearest one, if it's
            // close enough
            onClick={event => {
              if (
                !(event.target instanceof Element) ||
                event.target.closest('[data-series]')
              ) {
                return;
              }
              const segment = findNearestSegment(
                event.currentTarget,
                event.clientX,
                event.clientY,
                MAX_CLICK_DISTANCE,
              );
              if (segment) {
                onSegmentClick(
                  segment.index,
                  segment.series,
                  event,
                  segment.element,
                );
              } else {
                setTooltip('');
                onMissedClick(event);
              }
            }}
          >
            {!compact && <div style={{ marginTop: '15px' }} />}
            <BarChart
              width={width}
              height={height}
              data={data.intervalData}
              margin={{ top: 0, right: 0, left: leftMargin, bottom: 10 }}
              style={{ cursor: pointer }}
              stackOffset="sign" //stacked by sign
            >
              {showTooltip && (
                <Tooltip
                  content={
                    <SeriesTooltip
                      legend={data.legend}
                      format={format}
                      compact={compact}
                      hoveredKey={tooltip}
                      order="stack"
                      hideZero
                      canOpenRows={canOpen}
                    />
                  }
                  formatter={numberFormatterTooltip}
                  isAnimationActive={false}
                  cursor={{ fill: 'transparent' }}
                />
              )}
              <XAxis
                dataKey="date"
                tick={{ fill: theme.pageText }}
                tickLine={{ stroke: theme.pageText }}
              />
              {!compact && <CartesianGrid strokeDasharray="3 3" />}
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
              <ChartSelection data={data.intervalData} series={tooltip} />
              {data.legend
                .slice(0)
                .reverse()
                .map(entry => (
                  <Bar
                    key={entry.dataKey}
                    dataKey={entry.dataKey}
                    stackId="a"
                    fill={entry.color}
                    {...animationProps}
                    shape={(props: BarShapeProps) => (
                      <g data-series={entry.dataKey} data-index={props.index}>
                        <Rectangle {...props} />
                      </g>
                    )}
                    onMouseLeave={() => {
                      setPointer('');
                      setTooltip('');
                    }}
                    onMouseEnter={() => {
                      setTooltip(entry.dataKey);
                      if (canOpen) {
                        setPointer('pointer');
                      }
                    }}
                    onClick={(_, index, event) =>
                      onSegmentClick(index, entry.dataKey, event)
                    }
                  >
                    {viewLabels && !compact && (
                      <LabelList
                        dataKey={entry.dataKey}
                        content={customLabelWithFormat}
                      />
                    )}
                  </Bar>
                ))}
            </BarChart>
          </div>
        )
      }
    </Container>
  );
}

// How far from a segment a click can be and still pick it, about a fingertip
const MAX_CLICK_DISTANCE = 40;

// The segment nearest a point on the page, within `maxDistance` of it
function findNearestSegment(
  container: Element,
  x: number,
  y: number,
  maxDistance: number,
) {
  let nearest: SVGElement | undefined;
  let nearestDistance = maxDistance;
  for (const segment of container.querySelectorAll<SVGElement>(
    '[data-series]',
  )) {
    const box = segment.getBoundingClientRect();
    if (box.height === 0) {
      continue;
    }
    const distance = Math.hypot(
      Math.max(box.left - x, x - box.right, 0),
      Math.max(box.top - y, y - box.bottom, 0),
    );
    if (distance <= nearestDistance) {
      nearest = segment;
      nearestDistance = distance;
    }
  }
  const series = nearest?.dataset.series;
  return nearest && series
    ? { element: nearest, series, index: Number(nearest.dataset.index) }
    : undefined;
}
