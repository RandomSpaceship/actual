import type {
  FormulaChartSettings,
  FormulaChartType,
  FormulaTableColumn,
  FormulaTableColumnType,
} from '@actual-app/core/types/models';
import type { TFunction } from 'i18next';

import type {
  FormulaCellValue,
  FormulaTable,
  FormulaTableCell,
} from './executeFormula';
import {
  getFormulaTableColumnNames,
  getFormulaTableColumnTypes,
} from './FormulaTable';
import type { FormulaIssue } from './resolveQuery';

// A row number label instead of a label column
export const rowNumberLabelColumn = -1;

export type FormulaChartSeries = {
  // The key of the value in each chart row
  key: string;
  columnIndex: number;
  // From the column settings or the header row. Empty when the column has
  // no name.
  name: string;
  type: FormulaTableColumnType;
};

// The label, then one value for each series. A cell that is not a number
// gives null, so the chart shows a gap.
export type FormulaChartRow = { label: string } & Record<
  string,
  string | number | null
>;

export type FormulaChartWarning =
  // The chart has no value column
  | { kind: 'no-values' }
  // The settings use a column that the table does not have
  | { kind: 'missing-column'; columnIndex: number }
  // A donut shows only its first value column
  | { kind: 'donut-first-column'; columnIndex: number }
  // A donut shows the size of each value, so a negative value and a positive
  // value look the same
  | { kind: 'donut-mixed-signs'; columnIndex: number };

export type FormulaChartData = {
  type: FormulaChartType;
  labelColumn: number;
  series: FormulaChartSeries[];
  rows: FormulaChartRow[];
  warnings: FormulaChartWarning[];
};

type LabelFormatter = (
  value: FormulaCellValue,
  type: FormulaTableColumnType,
) => string;

// Makes the rows of a chart from a table result. The column types and names
// are the same as in the table view.
export function getFormulaChartData(
  table: FormulaTable,
  columns: FormulaTableColumn[],
  headerRow: boolean,
  settings: FormulaChartSettings,
  formatLabel: LabelFormatter,
): FormulaChartData {
  const type = settings.type ?? 'bar';
  const width = Math.max(0, ...table.map(row => row.length));
  const bodyRows = headerRow ? table.slice(1) : table;
  const columnTypes = getFormulaTableColumnTypes(table, columns, headerRow);
  const columnNames = getFormulaTableColumnNames(table, columns, headerRow);
  const warnings: FormulaChartWarning[] = [];

  function isInTable(columnIndex: number) {
    const isFound = columnIndex >= 0 && columnIndex < width;
    if (!isFound) {
      warnings.push({ kind: 'missing-column', columnIndex });
    }
    return isFound;
  }

  const defaultLabelColumn = columnTypes.findIndex(
    columnType => columnType === 'text' || columnType === 'date',
  );
  const labelColumn =
    settings.labelColumn === undefined
      ? defaultLabelColumn
      : settings.labelColumn === rowNumberLabelColumn ||
          isInTable(settings.labelColumn)
        ? settings.labelColumn
        : defaultLabelColumn;

  let valueColumns = settings.valueColumns
    ? settings.valueColumns.filter(
        columnIndex => isInTable(columnIndex) && columnIndex !== labelColumn,
      )
    : columnTypes.flatMap((columnType, columnIndex) =>
        isNumericType(columnType) && columnIndex !== labelColumn
          ? [columnIndex]
          : [],
      );
  if (type === 'donut' && valueColumns.length > 1) {
    warnings.push({
      kind: 'donut-first-column',
      columnIndex: valueColumns[0],
    });
    valueColumns = valueColumns.slice(0, 1);
  }
  if (valueColumns.length === 0) {
    warnings.push({ kind: 'no-values' });
  }

  const series = valueColumns.map(
    (columnIndex, seriesIndex): FormulaChartSeries => ({
      key: `value${seriesIndex}`,
      columnIndex,
      name: columnNames[columnIndex] ?? '',
      type: columnTypes[columnIndex],
    }),
  );

  let rows = bodyRows.map((row, rowIndex): FormulaChartRow => {
    const chartRow: FormulaChartRow = {
      label:
        labelColumn === rowNumberLabelColumn
          ? String(rowIndex + 1)
          : getLabel(row[labelColumn] ?? null, columnTypes[labelColumn]),
    };
    for (const { key, columnIndex } of series) {
      const cell = row[columnIndex] ?? null;
      chartRow[key] =
        typeof cell === 'number' ? (settings.flipSign ? -cell : cell) : null;
    }
    return chartRow;
  });

  if (type === 'donut' && series.length > 0) {
    const [{ key, columnIndex }] = series;
    const values = rows.map(row => row[key]);
    if (
      values.some(value => typeof value === 'number' && value > 0) &&
      values.some(value => typeof value === 'number' && value < 0)
    ) {
      warnings.push({ kind: 'donut-mixed-signs', columnIndex });
    }
    // A slice has a size, so it cannot be negative. Rows without a value
    // have no slice.
    rows = rows.flatMap(row => {
      const value = row[key];
      return typeof value === 'number' && value !== 0
        ? [{ ...row, [key]: Math.abs(value) }]
        : [];
    });
  }

  return { type, labelColumn, series, rows, warnings };

  function getLabel(
    cell: FormulaTableCell,
    columnType: FormulaTableColumnType,
  ) {
    return isErrorCell(cell) ? cell.error : formatLabel(cell, columnType);
  }
}

function isErrorCell(cell: FormulaTableCell): cell is { error: string } {
  return typeof cell === 'object' && cell !== null;
}

function isNumericType(type: FormulaTableColumnType) {
  return type === 'money' || type === 'percent' || type === 'number';
}

// The chart warnings as issues. Only 'no-values' is an error, because the
// chart is then empty.
export function getFormulaChartIssues(
  warnings: FormulaChartWarning[],
  t: TFunction,
): FormulaIssue[] {
  return warnings.map(warning => {
    switch (warning.kind) {
      case 'no-values':
        return {
          severity: 'error',
          kind: 'chart',
          name: '',
          message: t(
            'The chart has no values. Select a value column, or give a number column a money, percent or number type.',
          ),
        };
      case 'missing-column':
        return {
          severity: 'warning',
          kind: 'chart',
          name: String(warning.columnIndex + 1),
          message: t(
            'The table has no column {{columnNumber}}, so the chart does not use it.',
            { columnNumber: warning.columnIndex + 1 },
          ),
        };
      case 'donut-first-column':
        return {
          severity: 'warning',
          kind: 'chart',
          name: String(warning.columnIndex + 1),
          message: t(
            'A donut shows one value column. It shows column {{columnNumber}}.',
            { columnNumber: warning.columnIndex + 1 },
          ),
        };
      case 'donut-mixed-signs':
        return {
          severity: 'warning',
          kind: 'chart',
          name: String(warning.columnIndex + 1),
          message: t(
            'Column {{columnNumber}} has positive and negative values. A donut shows the size of each value, so the signs do not show.',
            { columnNumber: warning.columnIndex + 1 },
          ),
        };
      default:
        throw new Error(
          `Unknown chart warning: ${JSON.stringify(warning satisfies never)}`,
        );
    }
  });
}
