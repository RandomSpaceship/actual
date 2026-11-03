import { useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  FormulaTableColumn,
  FormulaTableColumnType,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type { FormulaTable as FormulaTableData } from './executeFormula';

type FormulaTableProps = {
  table: FormulaTableData;
  columns?: FormulaTableColumn[];
  style?: CSSProperties;
};

export function FormulaTable({
  table,
  columns = [],
  style,
}: FormulaTableProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();

  const columnTypes = getFormulaTableColumnTypes(table, columns);
  const hasHeader = columns.some(column => column.name);

  function formatCell(
    value: string | number | boolean | null,
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
  }

  return (
    <View
      style={{
        width: '100%',
        overflow: 'auto',
        ...styles.horizontalScrollbar,
        ...style,
      }}
    >
      <table
        style={{
          borderCollapse: 'collapse',
          minWidth: '100%',
          fontSize: 13,
          color: theme.tableText,
        }}
      >
        {hasHeader && (
          <thead>
            <tr>
              {columnTypes.map((type, columnIndex) => (
                <th
                  key={columnIndex}
                  scope="col"
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: theme.tableBackground,
                    color: theme.tableHeaderText,
                    fontWeight: 400,
                    padding: '5px 10px',
                    whiteSpace: 'nowrap',
                    textAlign: isNumericType(type) ? 'right' : 'left',
                    borderBottom: `1px solid ${theme.tableBorder}`,
                  }}
                >
                  {columns[columnIndex]?.name ?? ''}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                borderTop:
                  rowIndex > 0 ? `1px solid ${theme.tableBorder}` : undefined,
              }}
            >
              {columnTypes.map((type, columnIndex) => {
                const cell = row[columnIndex] ?? null;
                const cellStyle: CSSProperties = {
                  padding: '5px 10px',
                  whiteSpace: 'nowrap',
                  textAlign: isNumericType(type) ? 'right' : 'left',
                };
                if (isErrorCell(cell)) {
                  return (
                    <td
                      key={columnIndex}
                      title={cell.error}
                      style={{ ...cellStyle, color: theme.errorText }}
                    >
                      {cell.error}
                    </td>
                  );
                }
                const text = formatCell(cell, type);
                return (
                  <td key={columnIndex} style={cellStyle}>
                    {type === 'money' ? (
                      <FinancialText>
                        <PrivacyFilter>{text}</PrivacyFilter>
                      </FinancialText>
                    ) : isNumericType(type) ? (
                      <FinancialText>{text}</FinancialText>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </View>
  );
}

// The type of each column. A column without a type shows as money when all of
// its cells are numbers, and as text when they are not.
export function getFormulaTableColumnTypes(
  table: FormulaTableData,
  columns: FormulaTableColumn[],
): FormulaTableColumnType[] {
  const width = Math.max(0, ...table.map(row => row.length));
  return Array.from({ length: width }, (_, columnIndex) => {
    const setType = columns[columnIndex]?.type;
    if (setType) return setType;
    const values = table
      .map(row => row[columnIndex] ?? null)
      .filter(cell => cell !== null && !isErrorCell(cell));
    return values.length > 0 && values.every(value => typeof value === 'number')
      ? 'money'
      : 'text';
  });
}

function isErrorCell(
  cell: FormulaTableData[number][number],
): cell is { error: string } {
  return typeof cell === 'object' && cell !== null;
}

function isNumericType(type: FormulaTableColumnType) {
  return type === 'money' || type === 'percent' || type === 'number';
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
    return monthUtils.format(value, 'MMM yyyy', locale);
  }
  return value;
}
