import type { ComponentProps } from 'react';

import type {
  IntervalEntity,
  LegendEntity,
} from '@actual-app/core/types/models';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TestProviders } from '#mocks';

import { SeriesTooltip } from './SeriesTooltip';

const legend: LegendEntity[] = [
  { name: 'Food', id: 'food', color: '#f00', dataKey: 'food' },
  { name: 'Fun', id: 'fun', color: '#0f0', dataKey: 'fun' },
];

function makeInterval(series: Record<string, number | null>): IntervalEntity {
  return {
    date: 'Oct 2026',
    totalAssets: 0,
    totalDebts: 0,
    totalTotals: 0,
    netAssets: 0,
    netDebts: 0,
    totalBudgeted: 0,
    ...series,
  };
}

function renderTooltip(
  interval: IntervalEntity,
  props: Partial<ComponentProps<typeof SeriesTooltip>> = {},
) {
  const { container } = render(
    <TestProviders>
      <SeriesTooltip
        active
        payload={[{ payload: interval }]}
        legend={props.legend ?? legend}
        format={value => String(value)}
        compact={false}
        hoveredKey=""
        order="value"
        {...props}
      />
    </TestProviders>,
  );
  return container.textContent;
}

describe('SeriesTooltip', () => {
  it('lists each series, largest first, and their total', () => {
    expect(renderTooltip(makeInterval({ food: -80, fun: -20 }))).toBe(
      'Oct 2026Fun-20Food-80Total-100',
    );
  });

  it('lists stacks in legend order and can leave out zeros', () => {
    expect(
      renderTooltip(makeInterval({ food: 0, fun: 30 }), {
        order: 'stack',
        hideZero: true,
      }),
    ).toBe('Oct 2026Fun30Total30');
  });

  it('trims compact tooltips but keeps the hovered series', () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      name: `S${index}`,
      id: `s${index}`,
      color: '#000',
      dataKey: `s${index}`,
    }));
    const interval = makeInterval(
      Object.fromEntries(many.map((entry, index) => [entry.dataKey, index])),
    );

    expect(
      renderTooltip(interval, {
        legend: many,
        order: 'stack',
        compact: true,
        hoveredKey: 's6',
      }),
    ).toBe('Oct 2026S00S11S22S33S66...Total21');
  });

  it('renders nothing while inactive', () => {
    expect(
      renderTooltip(makeInterval({ food: 1, fun: 2 }), { active: false }),
    ).toBe('');
  });
});
