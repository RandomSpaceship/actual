import React from 'react';

import { FinancialText } from '#components/FinancialText';
import type { FormatType } from '#hooks/useFormat';

export type SeriesRow = {
  key: string;
  name: string;
  color: string;
  value: number;
};

type SeriesTooltipRowProps = {
  row: SeriesRow;
  isHovered: boolean;
  format: (value: unknown, type: FormatType) => string;
};

/**
 * One series' cells in a series tooltip's grid.
 */
export function SeriesTooltipRow({
  row,
  isHovered,
  format,
}: SeriesTooltipRowProps) {
  const textDecoration = isHovered ? 'underline' : 'inherit';

  return (
    <>
      <span
        data-tooltip-row={row.key}
        style={{ color: row.color, textDecoration }}
      >
        {row.name}
      </span>
      <FinancialText
        data-tooltip-row={row.key}
        style={{ color: row.color, textAlign: 'right', textDecoration }}
      >
        {format(row.value, 'financial')}
      </FinancialText>
    </>
  );
}
