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
  FormulaTableHeader,
  FormulaTableTotals,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { getAmountColor } from '#components/reports/graphs/tableGraph/ReportTableRow';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import { maxShownTableColumns, maxShownTableRows } from './executeFormula';
import type { FormulaTable as FormulaTableData } from './executeFormula';

type FormulaTableProps = {
  table: FormulaTableData;
  columns?: FormulaTableColumn[];
  // Show the first row as the header row
  headerRow?: boolean;
  totals?: FormulaTableTotals;
  // Small text and rows, as the custom report table on a dashboard card
  compact?: boolean;
  style?: CSSProperties;
};

export function FormulaTable({
  table,
  columns = [],
  headerRow = false,
  totals = 'none',
  compact = false,
  style,
}: FormulaTableProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();

  const bodyRows = headerRow ? table.slice(1) : table;
  const columnTypes = getFormulaTableColumnTypes(table, columns, headerRow);
  const headerNames = getFormulaTableColumnNames(table, columns, headerRow);
  const hasHeader = headerNames.some(name => name !== '');
  // The totals use the full table. Only the shown part is cut.
  const tableTotals = getFormulaTableTotals(bodyRows, columnTypes, totals);
  const shownBodyRows = bodyRows.slice(
    0,
    maxShownTableRows - (headerRow ? 1 : 0),
  );
  const shownTypes = columnTypes.slice(0, maxShownTableColumns);
  const displayTypes = tableTotals.rowTotals
    ? [...shownTypes, tableTotals.totalColumnType]
    : shownTypes;
  const shownColumnTotals =
    tableTotals.columnTotals &&
    (tableTotals.rowTotals
      ? [
          ...tableTotals.columnTotals.slice(0, shownTypes.length),
          tableTotals.columnTotals[tableTotals.columnTotals.length - 1],
        ]
      : tableTotals.columnTotals.slice(0, shownTypes.length));

  // The same cell size as the custom report table. Its 20px rows overlap by
  // 1px, so each row starts 19px below the last.
  const cellSize: CSSProperties = compact
    ? { padding: '0 5px', height: 19 }
    : { padding: '5px 10px' };

  // With the line of the last row, a 2px line, as in the custom report table
  const totalsBorder: CSSProperties = {
    borderTop: `1px solid ${theme.tableBorder}`,
  };

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

  function renderCell(
    cell: FormulaTableData[number][number],
    type: FormulaTableColumnType,
    columnIndex: number,
    extraStyle?: CSSProperties,
  ) {
    const cellStyle: CSSProperties = {
      ...cellSize,
      whiteSpace: 'nowrap',
      textAlign: isNumericType(type) ? 'right' : 'left',
      borderBottom: `1px solid ${theme.tableBorder}`,
      ...extraStyle,
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
  }

  return (
    <View
      style={{
        width: '100%',
        overflow: 'auto',
        ...styles.horizontalScrollbar,
        ...style,
        // A sticky header stays below the top padding, and rows that scroll
        // past show in that gap
        paddingTop: 0,
      }}
    >
      <table
        style={{
          // Separate borders stay on the sticky header cells. Collapsed
          // borders stay on the table, so they scroll away.
          borderCollapse: 'separate',
          borderSpacing: 0,
          minWidth: '100%',
          fontSize: compact ? styles.tinyText.fontSize : 13,
          color: theme.tableText,
        }}
      >
        {hasHeader && (
          <thead>
            <tr>
              {displayTypes.map((type, columnIndex) => (
                <th
                  key={columnIndex}
                  scope="col"
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: theme.tableHeaderBackground,
                    color: theme.tableHeaderText,
                    fontWeight: 600,
                    ...cellSize,
                    whiteSpace: 'nowrap',
                    textAlign: isNumericType(type) ? 'right' : 'left',
                    // The custom report table has a 2px line under the header
                    borderTop: `1px solid ${theme.tableBorder}`,
                    borderBottom: `2px solid ${theme.tableBorder}`,
                  }}
                >
                  {/* A month in the header row shows as a date */}
                  {columnIndex >= shownTypes.length
                    ? t('Totals')
                    : headerRow && !columns[columnIndex]?.name
                      ? formatDate(headerNames[columnIndex], dateFormat, locale)
                      : headerNames[columnIndex]}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {shownBodyRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {shownTypes.map((type, columnIndex) =>
                renderCell(row[columnIndex] ?? null, type, columnIndex),
              )}
              {tableTotals.rowTotals &&
                renderCell(
                  tableTotals.rowTotals[rowIndex],
                  tableTotals.totalColumnType,
                  shownTypes.length,
                  { fontWeight: 600 },
                )}
            </tr>
          ))}
        </tbody>
        {shownColumnTotals && (
          <tfoot>
            <tr
              style={{
                color: theme.tableRowHeaderText,
                backgroundColor: theme.tableRowHeaderBackground,
                fontWeight: 600,
              }}
            >
              {shownColumnTotals.map((total, columnIndex) =>
                columnIndex === tableTotals.labelColumn
                  ? renderCell(t('Totals'), 'text', columnIndex, totalsBorder)
                  : renderCell(
                      total,
                      displayTypes[columnIndex],
                      columnIndex,
                      // A money total has the colours of the custom report
                      // totals. A number column has none. The neutral colour
                      // of 0 is too light on the light theme totals row.
                      displayTypes[columnIndex] === 'money' &&
                        total !== null &&
                        total !== 0
                        ? { ...totalsBorder, color: getAmountColor(total) }
                        : totalsBorder,
                    ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </View>
  );
}

// The type of each column. A column without a type shows as money when all of
// its cells are numbers, and as text when they are not. A header row does not
// count.
export function getFormulaTableColumnTypes(
  table: FormulaTableData,
  columns: FormulaTableColumn[],
  headerRow = false,
): FormulaTableColumnType[] {
  const width = Math.max(0, ...table.map(row => row.length));
  const bodyRows = headerRow ? table.slice(1) : table;
  return Array.from({ length: width }, (_, columnIndex) => {
    const setType = columns[columnIndex]?.type;
    if (setType) return setType;
    const values = bodyRows
      .map(row => row[columnIndex] ?? null)
      .filter(cell => cell !== null && !isErrorCell(cell));
    return values.length > 0 && values.every(value => typeof value === 'number')
      ? 'money'
      : 'text';
  });
}

type FormulaTableTotalsResult = {
  // The total of each body row, or null without a totals column
  rowTotals: Array<number | null> | null;
  // The total of each column, then the total of the totals column if there
  // is one. null without a totals row.
  columnTotals: Array<number | null> | null;
  totalColumnType: FormulaTableColumnType;
  // The column that shows "Total" in the totals row, or -1
  labelColumn: number;
};

// Only money and number columns have a total. A percent, date or text
// column has none, and an error cell does not count.
export function getFormulaTableTotals(
  bodyRows: FormulaTableData,
  columnTypes: FormulaTableColumnType[],
  totals: FormulaTableTotals,
): FormulaTableTotalsResult {
  const isSummed = columnTypes.map(
    type => type === 'money' || type === 'number',
  );
  const totalColumnType = columnTypes.some(type => type === 'money')
    ? 'money'
    : 'number';
  const rowTotals =
    totals === 'column' || totals === 'both'
      ? bodyRows.map(row =>
          sumNumbers(row.filter((_, columnIndex) => isSummed[columnIndex])),
        )
      : null;
  if (totals !== 'row' && totals !== 'both') {
    return { rowTotals, columnTotals: null, totalColumnType, labelColumn: -1 };
  }

  const columnTotals: Array<number | null> = columnTypes.map(
    (_, columnIndex) => {
      if (!isSummed[columnIndex]) return null;
      return sumNumbers(bodyRows.map(row => row[columnIndex] ?? null));
    },
  );
  if (rowTotals) {
    columnTotals.push(sumNumbers(rowTotals));
  }
  return {
    rowTotals,
    columnTotals,
    totalColumnType,
    labelColumn: columnTypes.findIndex(type => type === 'text'),
  };
}

// The sum of the number cells, or null when there are none
function sumNumbers(cells: FormulaTableData[number]): number | null {
  const numbers = cells.filter(cell => typeof cell === 'number');
  return numbers.length > 0
    ? numbers.reduce((sum, value) => sum + value, 0)
    : null;
}

// For 'auto', the first row is the header row when it has no numbers, and a
// column has text in the first row and only numbers below it. QUERY_PIVOT
// gives such a table. QUERY_GROUP does not, because each row has a number.
export function isFormulaTableHeaderRowShown(
  table: FormulaTableData,
  setting: FormulaTableHeader = 'auto',
): boolean {
  if (setting !== 'auto') return setting === 'first-row';
  const [firstRow, ...bodyRows] = table;
  if (!firstRow || bodyRows.length === 0) return false;
  if (firstRow.some(cell => typeof cell !== 'string' && cell !== null)) {
    return false;
  }
  return firstRow.some(
    (cell, columnIndex) =>
      typeof cell === 'string' &&
      cell !== '' &&
      bodyRows.every(row => typeof row[columnIndex] === 'number'),
  );
}

// The name of each column. A name in the column settings wins over the
// header row.
export function getFormulaTableColumnNames(
  table: FormulaTableData,
  columns: FormulaTableColumn[],
  headerRow = false,
): string[] {
  const width = Math.max(0, ...table.map(row => row.length));
  return Array.from({ length: width }, (_, columnIndex) => {
    const setName = columns[columnIndex]?.name;
    if (setName) return setName;
    const headerCell = headerRow ? (table[0]?.[columnIndex] ?? null) : null;
    if (headerCell === null) return '';
    return isErrorCell(headerCell) ? headerCell.error : String(headerCell);
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
    // As the custom report table
    return monthUtils.format(value, "MMM ''yy", locale);
  }
  return value;
}
