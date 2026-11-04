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
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import { renderCustomLabel } from './renderCustomLabel';
import { SeriesTooltip } from './SeriesTooltip';
import { showActivity } from './showActivity';

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
  // Shows the values in place of useFormat
  format?: GraphFormat;
  // false: the bars of an interval stand side by side
  stacked?: boolean;
} & GraphItemClickProps;

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
  format: formatProp,
  stacked = true,
  onItemClick,
  isItemClickable,
}: StackedBarGraphProps) {
  const animationProps = useRechartsAnimation();
  const navigate = useNavigate();
  const { data: categories = { grouped: [], list: [] } } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const privacyMode = usePrivacyMode();
  const defaultFormat = useFormat();
  const format = formatProp ?? defaultFormat;

  const customLabelWithFormat = props => customLabel({ ...props, format });

  const [pointer, setPointer] = useState('');
  const [tooltip, setTooltip] = useState('');

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
    >
      {(width, height) =>
        data.intervalData && (
          <div>
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
              {/* A stack draws its first series at the top, so the legend
                  order runs top to bottom. Side by side bars run left to
                  right. */}
              {(stacked ? data.legend.slice(0).reverse() : data.legend).map(
                entry => (
                  <Bar
                    key={entry.dataKey}
                    dataKey={entry.dataKey}
                    stackId={stacked ? 'a' : undefined}
                    fill={entry.color}
                    {...animationProps}
                    onMouseLeave={() => {
                      setPointer('');
                      setTooltip('');
                    }}
                    onMouseEnter={(_, index) => {
                      setTooltip(entry.dataKey);
                      const isClickable = onItemClick
                        ? (isItemClickable?.({
                            index,
                            dataKey: entry.dataKey,
                          }) ?? true)
                        : groupBy !== 'Interval';
                      if (isClickable) {
                        setPointer('pointer');
                      }
                    }}
                    onClick={(e, index) => {
                      if (compact && !showTooltip) {
                        return;
                      }
                      if (onItemClick) {
                        onItemClick({ index, dataKey: entry.dataKey });
                        return;
                      }
                      if (groupBy === 'Interval') {
                        return;
                      }
                      showActivity({
                        navigate,
                        categories,
                        accounts,
                        balanceTypeOp,
                        filters,
                        showHiddenCategories,
                        showOffBudget,
                        type: 'time',
                        startDate: e.payload?.intervalStartDate,
                        endDate: e.payload?.intervalEndDate,
                        field: groupBy.toLowerCase(),
                        id: entry.id,
                        uncategorizedId: entry.uncategorizedId,
                        bucketTagNames: entry.bucketTagNames,
                        scopeTagNames: data.scopeTagNames,
                        interval,
                      });
                    }}
                  >
                    {viewLabels && !compact && (
                      <LabelList
                        dataKey={entry.dataKey}
                        content={customLabelWithFormat}
                      />
                    )}
                  </Bar>
                ),
              )}
            </BarChart>
          </div>
        )
      }
    </Container>
  );
}
