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
// No series column: each value column is a series
export const noSeriesColumn = -1;
// More series than this gives a warning, because the colours repeat
export const manySeriesLimit = 20;

export type FormulaChartSeries = {
  // The key of the value in each chart row
  key: string;
  // The value column of the series
  columnIndex: number;
  // From the column settings or the header row, or the series value of a
  // long table. Empty when the column has no name.
  name: string;
  type: FormulaTableColumnType;
};

// The label, then one value for each series. A cell that is not a number
// gives null, so the chart shows a gap. An outer slice of a two-ring donut
// also has the label of its group.
export type FormulaChartRow = { label: string } & Record<
  string,
  string | number | null
>;

// A cell of the table result
export type FormulaTableCellPosition = {
  rowIndex: number;
  columnIndex: number;
};

// The table cells of each value of one chart row, by series key. A value
// that adds up more than one row has more than one cell. A value without a
// row (0 in a long table) has none.
export type FormulaChartRowCells = Record<string, FormulaTableCellPosition[]>;

export type FormulaChartWarning =
  // The chart has no value column
  | { kind: 'no-values' }
  // The settings use a column that the table does not have
  | { kind: 'missing-column'; columnIndex: number }
  // A donut shows only its first value column
  | { kind: 'donut-first-column'; columnIndex: number }
  // With a series column, the chart shows only the first value column
  | { kind: 'series-first-column'; columnIndex: number }
  // The series column gives more series than manySeriesLimit
  | { kind: 'many-series'; count: number }
  // A donut shows the size of each value, so a negative value and a positive
  // value look the same
  | { kind: 'donut-mixed-signs'; columnIndex: number };

export type FormulaChartData = {
  type: FormulaChartType;
  labelColumn: number;
  seriesColumn: number;
  // Bar and area only
  stacked: boolean;
  series: FormulaChartSeries[];
  rows: FormulaChartRow[];
  // One for each row
  rowCells: FormulaChartRowCells[];
  // The inner ring of a two-ring donut: one row for each group, with the sum
  // of its outer slices. The rows are then the outer slices, in group order,
  // and each one has a 'group' label.
  groups?: FormulaChartRow[];
  // One for each group
  groupCells?: FormulaChartRowCells[];
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
  const stacked =
    (settings.stacked ?? false) && (type === 'bar' || type === 'area');
  const width = Math.max(0, ...table.map(row => row.length));
  const bodyRows = headerRow ? table.slice(1) : table;
  const toTableRowIndex = (bodyRowIndex: number) =>
    headerRow ? bodyRowIndex + 1 : bodyRowIndex;
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
  function isLabelType(columnType: FormulaTableColumnType) {
    return columnType === 'text' || columnType === 'date';
  }

  const defaultLabelColumn = columnTypes.findIndex(isLabelType);
  const labelColumn =
    settings.labelColumn === undefined
      ? defaultLabelColumn
      : settings.labelColumn === rowNumberLabelColumn ||
          isInTable(settings.labelColumn)
        ? settings.labelColumn
        : defaultLabelColumn;

  // A long table has a label more than one time, once for each series. A
  // wide table with a second text column, for example notes, does not.
  const labels = bodyRows.map((row, rowIndex) => getRowLabel(row, rowIndex));
  const hasRepeatedLabels = new Set(labels).size < labels.length;
  const defaultSeriesColumn = hasRepeatedLabels
    ? columnTypes.findIndex(
        (columnType, columnIndex) =>
          isLabelType(columnType) && columnIndex !== labelColumn,
      )
    : noSeriesColumn;
  const seriesColumn =
    settings.seriesColumn === undefined
      ? defaultSeriesColumn
      : settings.seriesColumn === noSeriesColumn ||
          settings.seriesColumn === labelColumn ||
          !isInTable(settings.seriesColumn)
        ? noSeriesColumn
        : settings.seriesColumn;
  const hasSeriesColumn = seriesColumn !== noSeriesColumn;

  let valueColumns = settings.valueColumns
    ? settings.valueColumns.filter(
        columnIndex =>
          isInTable(columnIndex) &&
          columnIndex !== labelColumn &&
          columnIndex !== seriesColumn,
      )
    : columnTypes.flatMap((columnType, columnIndex) =>
        isNumericType(columnType) &&
        columnIndex !== labelColumn &&
        columnIndex !== seriesColumn
          ? [columnIndex]
          : [],
      );
  if ((hasSeriesColumn || type === 'donut') && valueColumns.length > 1) {
    warnings.push({
      kind: hasSeriesColumn ? 'series-first-column' : 'donut-first-column',
      columnIndex: valueColumns[0],
    });
    valueColumns = valueColumns.slice(0, 1);
  }
  if (valueColumns.length === 0) {
    warnings.push({ kind: 'no-values' });
  }

  function getRowLabel(row: FormulaTableCell[], rowIndex: number) {
    return labelColumn === rowNumberLabelColumn
      ? String(rowIndex + 1)
      : getLabel(row[labelColumn] ?? null, columnTypes[labelColumn]);
  }
  function getValue(cell: FormulaTableCell | undefined) {
    return typeof cell === 'number' ? (settings.flipSign ? -cell : cell) : null;
  }

  if (hasSeriesColumn && valueColumns.length > 0) {
    const [valueColumn] = valueColumns;
    const longRows = bodyRows.map((row, rowIndex) => ({
      tableRowIndex: toTableRowIndex(rowIndex),
      label: labels[rowIndex],
      seriesName: getLabel(
        row[seriesColumn] ?? null,
        columnTypes[seriesColumn],
      ),
      value: getValue(row[valueColumn]),
    }));
    if (type === 'donut') {
      return {
        type,
        labelColumn,
        seriesColumn,
        stacked,
        ...getTwoRingRows(longRows, valueColumn),
        warnings,
      };
    }
    const series = getLongSeries(longRows, valueColumn);
    if (series.length > manySeriesLimit) {
      warnings.push({ kind: 'many-series', count: series.length });
    }
    return {
      type,
      labelColumn,
      seriesColumn,
      stacked,
      series,
      ...getLongRows(longRows, series, valueColumn),
      warnings,
    };
  }

  const series = valueColumns.map(
    (columnIndex, seriesIndex): FormulaChartSeries => ({
      key: `value${seriesIndex}`,
      columnIndex,
      name: columnNames[columnIndex] ?? '',
      type: columnTypes[columnIndex],
    }),
  );

  let rowsWithCells = bodyRows.map((row, rowIndex) => {
    const chartRow: FormulaChartRow = { label: labels[rowIndex] };
    const cells: FormulaChartRowCells = {};
    for (const { key, columnIndex } of series) {
      chartRow[key] = getValue(row[columnIndex]);
      cells[key] = [{ rowIndex: toTableRowIndex(rowIndex), columnIndex }];
    }
    return { chartRow, cells };
  });

  if (type === 'donut' && series.length > 0) {
    const [{ key, columnIndex }] = series;
    warnAboutMixedSigns(
      rowsWithCells.map(({ chartRow }) => chartRow[key]),
      columnIndex,
    );
    // A slice has a size, so it cannot be negative. Rows without a value
    // have no slice.
    rowsWithCells = rowsWithCells.flatMap(({ chartRow, cells }) => {
      const value = chartRow[key];
      return typeof value === 'number' && value !== 0
        ? [{ chartRow: { ...chartRow, [key]: Math.abs(value) }, cells }]
        : [];
    });
  }

  return {
    type,
    labelColumn,
    seriesColumn,
    stacked,
    series,
    rows: rowsWithCells.map(({ chartRow }) => chartRow),
    rowCells: rowsWithCells.map(({ cells }) => cells),
    warnings,
  };

  // One series for each series value, in the order of the table
  function getLongSeries(
    longRows: LongRow[],
    valueColumn: number,
  ): FormulaChartSeries[] {
    const seriesNames = [...new Set(longRows.map(row => row.seriesName))];
    return seriesNames.map((name, seriesIndex) => ({
      key: `value${seriesIndex}`,
      columnIndex: valueColumn,
      name,
      type: columnTypes[valueColumn],
    }));
  }

  // One row for each label. A label and series pair without a row gives 0,
  // because the table holds sums. Two rows with the same pair add up.
  function getLongRows(
    longRows: LongRow[],
    series: FormulaChartSeries[],
    valueColumn: number,
  ) {
    const keyOfSeries = new Map(
      series.map(oneSeries => [oneSeries.name, oneSeries.key]),
    );
    const rowOfLabel = new Map<
      string,
      { chartRow: FormulaChartRow; cells: FormulaChartRowCells }
    >();
    for (const { tableRowIndex, label, seriesName, value } of longRows) {
      let labelRow = rowOfLabel.get(label);
      if (!labelRow) {
        labelRow = { chartRow: { label }, cells: {} };
        for (const { key } of series) {
          labelRow.chartRow[key] = 0;
          labelRow.cells[key] = [];
        }
        rowOfLabel.set(label, labelRow);
      }
      const key = keyOfSeries.get(seriesName);
      if (key === undefined) continue;
      labelRow.cells[key]?.push({
        rowIndex: tableRowIndex,
        columnIndex: valueColumn,
      });
      if (value !== null) {
        labelRow.chartRow[key] = Number(labelRow.chartRow[key] ?? 0) + value;
      }
    }
    const labelRows = [...rowOfLabel.values()];
    return {
      rows: labelRows.map(({ chartRow }) => chartRow),
      rowCells: labelRows.map(({ cells }) => cells),
    };
  }

  // The label column gives the inner ring and the series column gives the
  // outer ring. The inner ring is the sum of its outer slices, so the rings
  // always agree.
  function getTwoRingRows(longRows: LongRow[], valueColumn: number) {
    const key = 'value0';
    const series: FormulaChartSeries[] = [
      {
        key,
        columnIndex: valueColumn,
        name: columnNames[valueColumn] ?? '',
        type: columnTypes[valueColumn],
      },
    ];
    warnAboutMixedSigns(
      longRows.map(row => row.value),
      valueColumn,
    );
    const slicesOfGroup = new Map<
      string,
      Array<{ chartRow: FormulaChartRow; cell: FormulaTableCellPosition }>
    >();
    // Also the rows without a slice, because the group adds them up
    const cellsOfGroup = new Map<string, FormulaTableCellPosition[]>();
    for (const { tableRowIndex, label, seriesName, value } of longRows) {
      const groupCells = cellsOfGroup.get(label) ?? [];
      groupCells.push({ rowIndex: tableRowIndex, columnIndex: valueColumn });
      cellsOfGroup.set(label, groupCells);
      if (value === null || value === 0) continue;
      const slices = slicesOfGroup.get(label) ?? [];
      slices.push({
        chartRow: { label: seriesName, group: label, [key]: Math.abs(value) },
        cell: { rowIndex: tableRowIndex, columnIndex: valueColumn },
      });
      slicesOfGroup.set(label, slices);
    }
    const groupSlices = [...slicesOfGroup];
    const slices = groupSlices.flatMap(([, oneGroupSlices]) => oneGroupSlices);
    return {
      series,
      rows: slices.map(({ chartRow }) => chartRow),
      rowCells: slices.map(({ cell }) => ({ [key]: [cell] })),
      groups: groupSlices.map(([label, oneGroupSlices]): FormulaChartRow => ({
        label,
        [key]: oneGroupSlices.reduce(
          (sum, slice) => sum + Number(slice.chartRow[key]),
          0,
        ),
      })),
      groupCells: groupSlices.map(([label]) => ({
        [key]: cellsOfGroup.get(label) ?? [],
      })),
    };
  }

  function warnAboutMixedSigns(
    values: Array<string | number | null>,
    columnIndex: number,
  ) {
    if (
      values.some(value => typeof value === 'number' && value > 0) &&
      values.some(value => typeof value === 'number' && value < 0)
    ) {
      warnings.push({ kind: 'donut-mixed-signs', columnIndex });
    }
  }

  function getLabel(
    cell: FormulaTableCell,
    columnType: FormulaTableColumnType,
  ) {
    return isErrorCell(cell) ? cell.error : formatLabel(cell, columnType);
  }
}

type LongRow = {
  tableRowIndex: number;
  label: string;
  seriesName: string;
  value: number | null;
};

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
      case 'series-first-column':
        return {
          severity: 'warning',
          kind: 'chart',
          name: String(warning.columnIndex + 1),
          message: t(
            'With a series column, the chart shows one value column. It shows column {{columnNumber}}.',
            { columnNumber: warning.columnIndex + 1 },
          ),
        };
      case 'many-series':
        return {
          severity: 'warning',
          kind: 'chart',
          name: '',
          message: t(
            'The chart has {{count}} series, so some colors repeat. Group the rows into fewer series, or select a different series column.',
            { count: warning.count },
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
