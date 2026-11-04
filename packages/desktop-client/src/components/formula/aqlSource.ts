import { sendCatch } from '@actual-app/core/platform/client/connection';
import {
  defaultAqlRowLimit,
  isAmountField,
  maxAqlRowLimit,
  parseAqlQuery,
} from '@actual-app/core/shared/formulas/aqlQuery';
import type { ParsedAqlQuery } from '@actual-app/core/shared/formulas/aqlQuery';
import type { QueryDateRange } from '@actual-app/core/shared/formulas/customFunctions';
import type { ObjectExpression, Query } from '@actual-app/core/shared/query';
import { t } from 'i18next';

import type { FormulaAqlConfig } from './resolveQuery';

// An error that the card shows with its message, after the query name
export class FormulaQueryError extends Error {}

export function parseAqlConfig(aql: FormulaAqlConfig): ParsedAqlQuery {
  const { query, error } = parseAqlQuery(aql.text);
  if (error !== undefined) {
    throw new FormulaQueryError(error);
  }
  return query;
}

// The field that the time frame filters, or null if the time frame does not
// apply. An AQL query that does not parse has no date field.
export function getAqlDateField(aql: FormulaAqlConfig): string | null {
  if (aql.dateField !== undefined) {
    return aql.dateField;
  }
  const { query } = parseAqlQuery(aql.text);
  return query?.table === 'transactions' ? 'date' : null;
}

// For the functions that take a filter query, such as QUERY_GROUP
export async function buildAqlFilterQuery(
  aql: FormulaAqlConfig,
  dateRange: QueryDateRange | null,
): Promise<Query> {
  const parsed = parseAqlConfig(aql);
  if (parsed.kind !== 'filter') {
    throw new FormulaQueryError(getKindMessage(parsed));
  }
  const query = addDateRange(parsed.query, aql, dateRange);
  // A query that does not compile fails here, and not in a later request that
  // shows the error to every part of the app
  await runAqlQuery(query.calculate({ $count: '*' }));
  return query;
}

// For QUERY. isAmount: the value is an integer amount, as the database stores
// it.
export async function fetchAqlQueryValue(
  aql: FormulaAqlConfig,
  dateRange: QueryDateRange | null,
): Promise<{ value: number; isAmount: boolean }> {
  const parsed = parseAqlConfig(aql);
  if (parsed.kind === 'filter') {
    const query = await buildAqlFilterQuery(aql, dateRange);
    return {
      value: toNumber(await runAqlQuery(query.calculate({ $sum: '$amount' }))),
      isAmount: true,
    };
  }
  if (parsed.kind !== 'value') {
    throw new FormulaQueryError(getKindMessage(parsed));
  }
  const value = await runAqlQuery(addDateRange(parsed.query, aql, dateRange));
  return {
    value: toNumber(value),
    isAmount: !parsed.isCountCalculation && !aql.isCount,
  };
}

// For QUERY_COUNT
export async function fetchAqlQueryCount(
  aql: FormulaAqlConfig,
  dateRange: QueryDateRange | null,
): Promise<number> {
  const query = await buildAqlFilterQuery(aql, dateRange);
  return toNumber(await runAqlQuery(query.calculate({ $count: '*' })));
}

export type AqlQueryTable = {
  columns: string[];
  // As the database gives them: a money cell is an integer
  rows: Array<Array<string | number | boolean | null>>;
  isMoneyColumn: boolean[];
  // The query gives more rows than rowLimit, so the rows stop there
  isCut: boolean;
  rowLimit: number;
  // The transactions of each row, for the transactions page. null: the rows
  // do not come from transactions, or a row has no field values that find
  // them.
  rowFilters: AqlRowFilter[] | null;
  // The rows have all of the transactions of the query: the rows are not cut,
  // and the query has no limit or offset
  hasAllRows: boolean;
};

// The filter of one row, and its name on the transactions page
export type AqlRowFilter = { name: string; filter: ObjectExpression };

// For QUERY_TABLE and the editor preview. The rows stop at the row limit of
// the query, or at a smaller limit that the query has.
export async function fetchAqlQueryTable(
  aql: FormulaAqlConfig,
  dateRange: QueryDateRange | null,
  rowLimit = getAqlRowLimit(aql),
): Promise<AqlQueryTable> {
  const parsed = parseAqlConfig(aql);
  if (parsed.kind !== 'table') {
    throw new FormulaQueryError(getQueryTableKindMessage(parsed));
  }
  let query = addDateRange(parsed.query, aql, dateRange);
  const ownLimit = query.state.limit;
  const isLimitChecked = ownLimit === null || ownLimit > rowLimit;
  if (isLimitChecked) {
    // One more row shows that the limit cuts the result
    query = query.limit(rowLimit + 1);
  }
  const data = await runAqlQuery(query);
  const records: Array<Record<string, unknown>> = Array.isArray(data)
    ? data
    : [];
  const isCut = isLimitChecked && records.length > rowLimit;
  const shownRecords = isCut ? records.slice(0, rowLimit) : records;

  const columns =
    parsed.columns?.map(column => column.name) ??
    Object.keys(shownRecords[0] ?? {});
  const moneyColumns =
    aql.moneyColumns ??
    (parsed.columns
      ? parsed.columns
          .filter(column => column.usesAmount)
          .map(column => column.name)
      : columns.filter(isAmountField));
  const rows = shownRecords.map(record =>
    columns.map(column => toTableValue(record[column])),
  );
  return {
    columns,
    rows,
    isMoneyColumn: columns.map(column => moneyColumns.includes(column)),
    isCut,
    rowLimit,
    rowFilters: getAqlRowFilters(parsed, columns, rows),
    hasAllRows:
      !isCut && ownLimit === null && parsed.query.state.offset === null,
  };
}

// A group of a transactions query has the values of its groupBy fields. A
// query without groupBy that selects the id gives one transaction in each
// row. Other rows have no filter: a groupBy expression such as
// {"$month": "$date"} needs the same expression in the filter.
function getAqlRowFilters(
  parsed: ParsedAqlQuery,
  columns: string[],
  rows: AqlQueryTable['rows'],
): AqlRowFilter[] | null {
  if (parsed.table !== 'transactions' || !parsed.columns) return null;
  const { groupExpressions } = parsed.query.state;
  const fields = groupExpressions.length > 0 ? [...groupExpressions] : ['id'];
  const fieldColumns = fields.map(field =>
    typeof field === 'string' && /^[A-Za-z_][\w.]*$/.test(field)
      ? columns.indexOf(field)
      : -1,
  );
  if (fieldColumns.some(columnIndex => columnIndex === -1)) return null;
  return rows.map(row => {
    const values = fieldColumns.map(columnIndex => row[columnIndex]);
    return {
      name: fields
        .map((field, index) => `${String(field)}: ${values[index] ?? ''}`)
        .join(', '),
      filter: {
        $and: fields.map((field, index) => ({
          [String(field)]: values[index],
        })),
      },
    };
  });
}

export function getAqlRowLimit(aql: FormulaAqlConfig) {
  const { rowLimit } = aql;
  if (rowLimit === undefined || !Number.isInteger(rowLimit) || rowLimit < 1) {
    return defaultAqlRowLimit;
  }
  return Math.min(rowLimit, maxAqlRowLimit);
}

// The fields that the time frame can filter, for each table
export function getAqlDateFields(table: string): string[] {
  switch (table) {
    case 'transactions':
      return ['date'];
    case 'schedules':
      return ['next_date'];
    default:
      return [];
  }
}

// For the functions that read the conditions of a filter query
export function getAqlNotSupportedError(functionName: string) {
  return new FormulaQueryError(
    t('{{functionName}} does not work with an AQL query', { functionName }),
  );
}

function getKindMessage(parsed: ParsedAqlQuery) {
  if (parsed.kind === 'value') {
    return t(
      'This AQL query gives one value. Use it in QUERY, or remove calculate to use it here',
    );
  }
  if (parsed.table !== 'transactions') {
    return t(
      'This AQL query reads {{table}}, not transactions, so it gives a table. Use it in QUERY_TABLE',
      { table: parsed.table },
    );
  }
  return t(
    'This AQL query gives a table, because it has select, groupBy, orderBy, limit or offset. Use it in QUERY_TABLE',
  );
}

function getQueryTableKindMessage(parsed: ParsedAqlQuery) {
  if (parsed.kind === 'value') {
    return t('This AQL query gives one value. Use it in QUERY');
  }
  return t(
    'This AQL query is a filter. Use it in QUERY, QUERY_COUNT, QUERY_GROUP or QUERY_PIVOT, or add select to use it in QUERY_TABLE',
  );
}

// A value that is not text, a number or a boolean shows as JSON
function toTableValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function addDateRange(
  query: Query,
  aql: FormulaAqlConfig,
  dateRange: QueryDateRange | null,
) {
  const dateField = getAqlDateField(aql);
  if (!dateRange || !dateField) {
    return query;
  }
  return query.filter({
    $and: [
      { [dateField]: { $gte: dateRange.start } },
      { [dateField]: { $lte: dateRange.end } },
    ],
  });
}

// sendCatch, so that a query that does not compile does not show the error
// to every part of the app
async function runAqlQuery(query: Query): Promise<unknown> {
  const { data, error } = await sendCatch('query', query.serialize());
  if (error) {
    // The compiler adds an expression stack after an empty line
    const [message] = (error.message ?? t('The query could not run')).split(
      '\n\n',
    );
    throw new FormulaQueryError(message);
  }
  return data.data;
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : 0;
}
