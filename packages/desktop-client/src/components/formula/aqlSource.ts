import { sendCatch } from '@actual-app/core/platform/client/connection';
import { parseAqlQuery } from '@actual-app/core/shared/formulas/aqlQuery';
import type { ParsedAqlQuery } from '@actual-app/core/shared/formulas/aqlQuery';
import type { QueryDateRange } from '@actual-app/core/shared/formulas/customFunctions';
import type { Query } from '@actual-app/core/shared/query';
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
      'This AQL query reads {{table}}, not transactions, so it gives a table',
      { table: parsed.table },
    );
  }
  return t(
    'This AQL query gives a table, because it has select, groupBy, orderBy, limit or offset',
  );
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
