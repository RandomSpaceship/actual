import { useTranslation } from 'react-i18next';

import * as monthUtils from '@actual-app/core/shared/months';
import { amountToInteger } from '@actual-app/core/shared/util';
import type { FormulaTableColumnType } from '@actual-app/core/types/models';

import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

type FormulaValue = string | number | boolean | null;

// Gives a function that shows a formula value in a format. The table columns
// and the one-value card use the same formats.
export function useFormulaValueFormatter() {
  const { t } = useTranslation();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();

  return function formatFormulaValue(
    value: FormulaValue,
    type: FormulaTableColumnType,
  ): string {
    if (value === null) return '';
    if (typeof value === 'number') {
      switch (type) {
        case 'money':
          return format(amountToInteger(value), 'financial');
        case 'percent':
          return format(value * 100, 'number') + '%';
        case 'number':
          return format(value, 'number');
        case 'date':
          return formatDate(serialToDate(value), dateFormat, locale);
        default:
          return String(value);
      }
    }
    if (type === 'date' && typeof value === 'string') {
      return formatDate(value, dateFormat, locale);
    }
    if (typeof value === 'boolean') {
      return value ? t('TRUE') : t('FALSE');
    }
    return value;
  };
}

// False when the format cannot show the value, so the value shows as the
// formula gives it. For example, text in a money column.
export function isFormulaValueFormattable(
  value: FormulaValue,
  type: FormulaTableColumnType,
): boolean {
  if (value === null) return true;
  switch (type) {
    case 'money':
    case 'percent':
    case 'number':
      return typeof value === 'number';
    case 'date':
      return (
        typeof value === 'number' ||
        (typeof value === 'string' &&
          (monthUtils.isValidYearMonthDay(value) ||
            monthUtils.isValidYearMonth(value)))
      );
    default:
      return true;
  }
}

// A spreadsheet date number counts days from 1899-12-30
function serialToDate(serial: number): string {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * millisecondsPerDay);
  return date.toISOString().slice(0, 10);
}

function formatDate(
  value: string,
  dateFormat: string,
  locale: ReturnType<typeof useLocale>,
): string {
  if (monthUtils.isValidYearMonthDay(value)) {
    return monthUtils.format(value, dateFormat, locale);
  }
  if (monthUtils.isValidYearMonth(value)) {
    // As the custom report table
    return monthUtils.format(value, "MMM ''yy", locale);
  }
  return value;
}
