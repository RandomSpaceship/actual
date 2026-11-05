import { send } from '@actual-app/core/platform/client/connection';
import type {
  QueryDateRange,
  QueryGroupDimension,
} from '@actual-app/core/shared/formulas/customFunctions';
import * as monthUtils from '@actual-app/core/shared/months';
import type { ObjectExpression } from '@actual-app/core/shared/query';
import type { RuleConditionEntity } from '@actual-app/core/types/models';
import { isEqual } from 'es-toolkit/compat';
import { t } from 'i18next';

import { getAqlDateField, parseAqlConfig } from './aqlSource';
import type { ResolvedNamedFormula } from './resolveNamedFormulas';
import type { FormulaQueryConfig } from './resolveQuery';

// A filter on the transactions page. A filter with customName and queryFilter
// is an AQL filter, as the "Selected transactions" filter of the page.
export type TransactionsCondition =
  | RuleConditionEntity
  | { customName: string; queryFilter: ObjectExpression };

// The transactions of one part of a table result
export type TransactionsFilter = {
  // null: all dates
  dateRange: { start: string; end: string } | null;
  // All of them must match
  conditions: TransactionsCondition[];
};

// The transactions of each cell of a table result. A cell gets the
// transactions of the query that also match the filter of its row and the
// filter of its column.
export type FormulaSourceMap = {
  query: TransactionsFilter;
  // One for each table row. null: the row has no transactions of its own, for
  // example a header row.
  rows: Array<TransactionsFilter | null>;
  // One for each table column of a wide table. null: each column reads the
  // transactions of its row.
  columns: Array<TransactionsFilter | null> | null;
  // The rows have all of the transactions of the query. A query with a limit
  // can stop before the end.
  isComplete: boolean;
};

// The rows and columns of one source function call, before the formula runs
export type FormulaSourceRows = Omit<FormulaSourceMap, 'query'>;

// The functions that give a table with one row (and column) for each group
// of transactions
const sourceFunctionNames = new Set([
  'QUERY_GROUP',
  'QUERY_GROUP_COUNT',
  'QUERY_PIVOT',
  'QUERY_PIVOT_COUNT',
  'QUERY_TABLE',
]);

export function combineTransactionsFilters(
  ...filters: Array<TransactionsFilter | null>
): TransactionsFilter {
  const presentFilters = filters.filter(filter => filter !== null);
  const dateRanges = presentFilters.flatMap(filter =>
    filter.dateRange ? [filter.dateRange] : [],
  );
  return {
    // The dates are YYYY-MM-DD, so text order is date order
    dateRange:
      dateRanges.length > 0
        ? {
            start: dateRanges
              .map(range => range.start)
              .reduce((a, b) => (a > b ? a : b)),
            end: dateRanges
              .map(range => range.end)
              .reduce((a, b) => (a < b ? a : b)),
          }
        : null,
    conditions: presentFilters.flatMap(filter => filter.conditions),
  };
}

// null: the cell has no transactions, for example a header cell
export function getCellTransactionsFilter(
  sourceMap: FormulaSourceMap,
  rowIndex: number,
  columnIndex: number,
): TransactionsFilter | null {
  const rowFilter = sourceMap.rows[rowIndex] ?? null;
  if (!sourceMap.columns) {
    return rowFilter && combineTransactionsFilters(sourceMap.query, rowFilter);
  }
  const columnFilter = sourceMap.columns[columnIndex] ?? null;
  if (!rowFilter && !columnFilter) return null;
  return combineTransactionsFilters(sourceMap.query, rowFilter, columnFilter);
}

// The transactions of a chart value, which can add up more than one cell.
// The cells must be in the value column of a long table. Their transactions
// are the ones that match the conditions that all of their rows have. Thus no
// other row can have all of these conditions, or it would add its
// transactions too. null: the cells have no shared filter.
export function getCellsTransactionsFilter(
  sourceMap: FormulaSourceMap,
  cells: Array<{ rowIndex: number; columnIndex: number }>,
): TransactionsFilter | null {
  if (cells.length === 1) {
    const [{ rowIndex, columnIndex }] = cells;
    return getCellTransactionsFilter(sourceMap, rowIndex, columnIndex);
  }
  if (cells.length === 0 || sourceMap.columns || !sourceMap.isComplete) {
    return null;
  }
  const rowIndexes = new Set(cells.map(cell => cell.rowIndex));
  const rowFilters = [...rowIndexes].map(
    rowIndex => sourceMap.rows[rowIndex] ?? null,
  );
  const [firstFilter, ...otherFilters] = rowFilters;
  if (!firstFilter || otherFilters.some(filter => filter === null)) {
    return null;
  }
  const hasCondition = (
    filter: TransactionsFilter,
    condition: TransactionsCondition,
  ) => filter.conditions.some(other => isEqual(other, condition));
  const sharedConditions = firstFilter.conditions.filter(condition =>
    otherFilters.every(filter => filter && hasCondition(filter, condition)),
  );
  // Rows with different periods do not share a date range
  const sharedDateRange = otherFilters.every(filter =>
    isEqual(filter?.dateRange, firstFilter.dateRange),
  )
    ? firstFilter.dateRange
    : null;

  const isMatchedByOtherRow = sourceMap.rows.some(
    (filter, rowIndex) =>
      filter !== null &&
      !rowIndexes.has(rowIndex) &&
      sharedConditions.every(condition => hasCondition(filter, condition)) &&
      (sharedDateRange === null ||
        filter.dateRange === null ||
        isEqual(filter.dateRange, sharedDateRange)),
  );
  if (isMatchedByOtherRow) return null;
  return combineTransactionsFilters(sourceMap.query, {
    dateRange: sharedDateRange,
    conditions: sharedConditions,
  });
}

// For the total of a row
export function getRowTransactionsFilter(
  sourceMap: FormulaSourceMap,
  rowIndex: number,
): TransactionsFilter | null {
  const rowFilter = sourceMap.rows[rowIndex] ?? null;
  return rowFilter && combineTransactionsFilters(sourceMap.query, rowFilter);
}

// For the total of a column
export function getColumnTransactionsFilter(
  sourceMap: FormulaSourceMap,
  columnIndex: number,
): TransactionsFilter | null {
  if (!sourceMap.isComplete) return null;
  if (!sourceMap.columns) return sourceMap.query;
  const columnFilter = sourceMap.columns[columnIndex] ?? null;
  return (
    columnFilter && combineTransactionsFilters(sourceMap.query, columnFilter)
  );
}

// For the total of all of the table
export function getTableTransactionsFilter(
  sourceMap: FormulaSourceMap,
): TransactionsFilter | null {
  return sourceMap.isComplete ? sourceMap.query : null;
}

// The filters for the transactions page
export function toFilterConditions(
  filter: TransactionsFilter,
): TransactionsCondition[] {
  if (!filter.dateRange) return filter.conditions;
  return [
    ...filter.conditions,
    {
      field: 'date',
      op: 'gte',
      value: filter.dateRange.start,
      type: 'date',
    },
    {
      field: 'date',
      op: 'lte',
      value: filter.dateRange.end,
      type: 'date',
    },
  ];
}

// The transactions of one key of a QUERY_GROUP or QUERY_PIVOT dimension. The
// key of a transaction without the field is ''.
export function getDimensionTransactionsFilter(
  dimension: QueryGroupDimension,
  key: string,
): TransactionsFilter {
  const toFilter = (condition: TransactionsCondition): TransactionsFilter => ({
    dateRange: null,
    conditions: [condition],
  });
  const toDateRange = (start: string, end: string): TransactionsFilter => ({
    dateRange: { start, end },
    conditions: [],
  });

  switch (dimension) {
    case 'day':
      return toDateRange(key, key);
    case 'week':
      return toDateRange(key, monthUtils.addDays(key, 6));
    case 'month':
      return toDateRange(
        monthUtils.firstDayOfMonth(key),
        monthUtils.lastDayOfMonth(key),
      );
    case 'quarter':
      return toDateRange(
        monthUtils.firstDayOfMonth(key),
        monthUtils.lastDayOfMonth(monthUtils.addMonths(key, 2)),
      );
    case 'year':
      return toDateRange(`${key}-01-01`, `${key}-12-31`);
    case 'category':
    case 'category_group':
      if (key === '') {
        return toFilter({
          customName: t('Category: {{name}}', { name: t('Uncategorized') }),
          // A split parent has no category, but its children do
          queryFilter: { category: null, is_parent: false },
        });
      }
      return toFilter(
        dimension === 'category'
          ? { field: 'category', op: 'is', value: key, type: 'id' }
          : { field: 'category_group', op: 'is', value: key, type: 'id' },
      );
    case 'payee':
      if (key === '') {
        return toFilter({
          customName: t('Payee: {{name}}', { name: t('No payee') }),
          queryFilter: { payee: null },
        });
      }
      return toFilter({ field: 'payee', op: 'is', value: key, type: 'id' });
    case 'account':
      return toFilter({ field: 'account', op: 'is', value: key, type: 'id' });
    default: {
      const unknownDimension: never = dimension;
      throw new Error(`Unknown dimension ${String(unknownDimension)}`);
    }
  }
}

// The transactions of a query. null: the query does not read transactions.
// The transactions page joins its filters with "and", so the conditions of an
// "or" query become one AQL filter.
export async function getQueryTransactionsFilter(
  queryName: string,
  config: FormulaQueryConfig,
  dateRange: QueryDateRange | null,
): Promise<TransactionsFilter | null> {
  const filterDateRange = dateRange
    ? { start: dateRange.start, end: dateRange.end }
    : null;
  const queryChipName = t('Query: {{name}}', { name: queryName });

  if (config.aql) {
    const parsed = parseAqlConfig(config.aql);
    if (parsed.table !== 'transactions') return null;
    // The transactions page has no other date field
    const dateField = getAqlDateField(config.aql);
    if (dateRange && dateField !== 'date') return null;
    const filters = parsed.query.state.filterExpressions;
    return {
      dateRange: filterDateRange,
      conditions:
        filters.length > 0
          ? [{ customName: queryChipName, queryFilter: { $and: [...filters] } }]
          : [],
    };
  }

  const conditions = config.conditions ?? [];
  if (config.conditionsOp !== 'or' || conditions.length < 2) {
    return { dateRange: filterDateRange, conditions };
  }
  const { filters } = await send('make-filters-from-conditions', {
    conditions,
  });
  return {
    dateRange: filterDateRange,
    conditions: [{ customName: queryChipName, queryFilter: { $or: filters } }],
  };
}

// The source function of a formula that is one call of it, for example
// =QUERY_GROUP("spending", "category"). A formula that is only the name of a
// named formula gives the call of that named formula. null: the formula does more than
// one call, so its cells can come from more than one place.
export function getSourceFunctionName(
  formula: string,
  namedFormulas: ResolvedNamedFormula[],
): string | null {
  const body = formula.replace(/^\s*=/, '').trim();

  const namedFormulaName = body.match(/^[A-Za-z_][\w.]*$/)?.[0];
  if (namedFormulaName !== undefined) {
    const namedFormula = namedFormulas.find(
      candidate =>
        candidate.name.toUpperCase() === namedFormulaName.toUpperCase(),
    );
    // A named formula cannot use itself, but a formula can name one that is not
    // there
    if (!namedFormula || namedFormula.formula === formula) return null;
    return getSourceFunctionName(namedFormula.formula, namedFormulas);
  }

  const call = body.match(/^([A-Za-z_][\w.]*)\s*\(/);
  if (!call) return null;
  const functionName = call[1].toUpperCase();
  if (!sourceFunctionNames.has(functionName)) return null;
  const callEnd = findCallEnd(body, call[0].length);
  if (callEnd === null || body.slice(callEnd + 1).trim() !== '') return null;
  return functionName;
}

// The position of the ")" that closes the call, or null. Text in quotes
// can have brackets, and "" is a quote in the text.
function findCallEnd(text: string, start: number): number | null {
  let depth = 1;
  let isInText = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      isInText = !isInText;
    } else if (!isInText && character === '(') {
      depth++;
    } else if (!isInText && character === ')') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return null;
}
