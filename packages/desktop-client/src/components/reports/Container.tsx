import React, { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AutoSizer } from 'react-virtualized-auto-sizer';

import { View } from '@actual-app/components/view';

import { useChartTouch } from './useChartTouch';

type ContainerProps = {
  style?: CSSProperties;
  children: (
    width: number,
    height: number,
    host: HTMLDivElement | null,
  ) => ReactNode;
  // Whether a tap outside the chart, or on its tooltip, closes the tooltip.
  // Off for charts that always show a selection.
  canDismissTooltip?: boolean;
  // A tap on a tooltip row marked with `data-tooltip-row` calls this
  onTooltipRowTap?: (row: HTMLElement) => void;
};
export function Container({
  style,
  children,
  canDismissTooltip = true,
  onTooltipRowTap,
}: ContainerProps) {
  const portalHost = useRef<HTMLDivElement>(null);
  const touchProps = useChartTouch({
    canDismiss: canDismissTooltip,
    onTooltipRowTap,
  });

  return (
    <View
      style={{ height: 300, position: 'relative', flexShrink: 0, ...style }}
    >
      <div ref={portalHost} />
      <AutoSizer
        renderProp={({ width = 0, height = 0 }) => {
          if (width === 0 || height === 0) {
            return null;
          }

          return (
            <div style={{ width, height }} {...touchProps}>
              {children(width, height, portalHost.current)}
            </div>
          );
        }}
      />
    </View>
  );
}
