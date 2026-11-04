import { AlignedText } from '@actual-app/components/aligned-text';
import { theme } from '@actual-app/components/theme';
import type { FormulaTableColumnType } from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';

import type { useFormulaValueFormatter } from './formatFormulaValue';
import type { FormulaChartRow } from './formulaChartData';

type FormulaChartTooltipProps = {
  row: FormulaChartRow;
  series: Array<{ key: string; name: string; type: FormulaTableColumnType }>;
  formatValue: ReturnType<typeof useFormulaValueFormatter>;
};

// The label, then the value of each series in the format of its column
export function FormulaChartTooltip({
  row,
  series,
  formatValue,
}: FormulaChartTooltipProps) {
  return (
    <div
      className={css({
        zIndex: 1000,
        pointerEvents: 'none',
        borderRadius: 2,
        boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
        backgroundColor: theme.menuBackground,
        color: theme.menuItemText,
        padding: 10,
      })}
    >
      <div style={{ marginBottom: 10 }}>
        <strong>{row.label}</strong>
      </div>
      <div style={{ lineHeight: 1.5 }}>
        {series.map(({ key, name, type }) => {
          const value = row[key] ?? null;
          const text = formatValue(value, type);
          return (
            <AlignedText
              key={key}
              left={name}
              right={
                <FinancialText>
                  {type === 'money' ? (
                    <PrivacyFilter>{text}</PrivacyFilter>
                  ) : (
                    text
                  )}
                </FinancialText>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
