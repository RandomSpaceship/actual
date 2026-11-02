import React from 'react';
import type { MouseEvent } from 'react';

import {
  DefaultZIndexes,
  usePlotArea,
  useYAxisScale,
  ZIndexLayer,
} from 'recharts';

// How far from a line a click can be and still pick it, about a fingertip
const MAX_CLICK_DISTANCE = 40;

type ChartColumnsProps = {
  data: ReadonlyArray<Record<string, unknown>>;
  // The lines to find the nearest of, by their data keys
  series?: readonly string[];
  // `series` is the line nearest the click, if one is close enough
  onClick: (
    index: number,
    series: string | undefined,
    event: MouseEvent<SVGRectElement>,
  ) => void;
  // As a mouse or finger moves over the columns, with the nearest line
  onMove?: (index: number, series: string | undefined) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

/**
 * Invisible targets over each column of a line or area chart, so a click
 * anywhere in a column is a click on its point, or on the nearest line's.
 * Recharts spreads the points evenly from one edge of the plot to the other.
 */
export function ChartColumns({
  data,
  series = [],
  onClick,
  onMove,
  onMouseEnter,
  onMouseLeave,
}: ChartColumnsProps) {
  const plot = usePlotArea();
  const yScale = useYAxisScale();
  const count = data.length;
  if (!plot || count === 0) {
    return null;
  }

  const step = count > 1 ? plot.width / (count - 1) : plot.width;
  const plotRight = plot.x + plot.width;

  // Where a point on the page falls in the chart
  const pointAt = (
    svg: SVGSVGElement | null,
    x: number,
    y: number,
    maxDistance = Infinity,
  ) => {
    const box = svg?.getBoundingClientRect();
    const chartX = x - (box?.left ?? 0);
    const chartY = y - (box?.top ?? 0);
    const index =
      count > 1
        ? Math.min(count - 1, Math.max(0, Math.round((chartX - plot.x) / step)))
        : 0;
    return { index, series: nearestSeries(index, chartX, chartY, maxDistance) };
  };

  const centerAt = (column: number) =>
    count > 1 ? plot.x + column * step : plot.x + plot.width / 2;

  // Where a line's point is, at a column
  const pointOf = (key: string, column: number) => {
    const value = data[column]?.[key];
    const y = typeof value === 'number' ? yScale?.(value) : undefined;
    return y == null ? null : { x: centerAt(column), y };
  };

  const nearestSeries = (
    index: number,
    chartX: number,
    chartY: number,
    maxDistance: number,
  ) => {
    let nearest: string | undefined;
    let nearestDistance = maxDistance;
    for (const key of series) {
      // A steep line can pass close to a click far from its points, so it's
      // measured to the straight lines on each side of the column's point
      const point = pointOf(key, index);
      if (!point) {
        continue;
      }
      const neighbours = [index - 1, index + 1]
        .filter(column => column >= 0 && column < count)
        .map(column => pointOf(key, column))
        .filter(neighbour => neighbour != null);
      // With one column the whole plot is its column, so only height counts
      const distance = Math.min(
        neighbours.length > 0
          ? Math.hypot(point.x - chartX, point.y - chartY)
          : Math.abs(point.y - chartY),
        ...neighbours.map(neighbour =>
          distanceToSegment(chartX, chartY, point, neighbour),
        ),
      );
      if (distance <= nearestDistance) {
        nearest = key;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  return (
    // Above the lines and their dots, which would take the click otherwise
    <ZIndexLayer zIndex={DefaultZIndexes.activeDot + 1}>
      <g
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseMove={event => {
          const point = pointAt(
            event.currentTarget.ownerSVGElement,
            event.clientX,
            event.clientY,
          );
          onMove?.(point.index, point.series);
        }}
        // A touch's events all go to where it started, so the point is
        // found from the finger
        onTouchMove={event => {
          const touch = event.touches[0];
          if (touch) {
            const point = pointAt(
              event.currentTarget.ownerSVGElement,
              touch.clientX,
              touch.clientY,
            );
            onMove?.(point.index, point.series);
          }
        }}
      >
        {Array.from({ length: count }, (_, index) => {
          const center = centerAt(index);
          const left = Math.max(plot.x, center - step / 2);
          const right = Math.min(plotRight, center + step / 2);
          return (
            <rect
              key={index}
              x={left}
              y={plot.y}
              width={right - left}
              height={plot.height}
              fill="transparent"
              onClick={event => {
                const point = pointAt(
                  event.currentTarget.ownerSVGElement,
                  event.clientX,
                  event.clientY,
                  MAX_CLICK_DISTANCE,
                );
                onClick(index, point.series, event);
              }}
            />
          );
        })}
      </g>
    </ZIndexLayer>
  );
}

type Point = { x: number; y: number };

// How far a point is from the straight line between two others
function distanceToSegment(x: number, y: number, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared),
        );
  return Math.hypot(x - (from.x + along * dx), y - (from.y + along * dy));
}
