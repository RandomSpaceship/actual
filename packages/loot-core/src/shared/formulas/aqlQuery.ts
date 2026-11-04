import { q } from '#shared/query';
import type { ObjectExpression, Query } from '#shared/query';

// The tables that an AQL query in the formula library can read. The other
// tables hold settings, rules and the dashboard itself.
export const aqlQueryTables = [
  'transactions',
  'accounts',
  'payees',
  'categories',
  'category_groups',
  'schedules',
  'zero_budgets',
  'reflect_budgets',
] as const;

// The most rows that a table query gives, if the query has no smaller limit.
// The library query can change it up to maxAqlRowLimit.
export const defaultAqlRowLimit = 1000;
export const maxAqlRowLimit = 10000;

// 'grouped' gives nested rows, which a formula cannot use
const aqlSplitOptions = ['inline', 'none', 'all'];

const aqlQueryKeys = [
  'table',
  'filter',
  'options',
  'groupBy',
  'select',
  'orderBy',
  'calculate',
  'limit',
  'offset',
];

// filter: a transactions query with only a filter (and options). It works in
// every function that takes a filter query, such as QUERY and QUERY_GROUP.
// value: the query has calculate, so it gives one value.
// table: the query gives rows.
export type AqlQueryKind = 'filter' | 'value' | 'table';

// A column of a table query. usesAmount: the expression reads a field named
// amount, so the column is money by default.
export type AqlQueryColumn = { name: string; usesAmount: boolean };

export type ParsedAqlQuery = {
  kind: AqlQueryKind;
  table: string;
  query: Query;
  // A value query whose calculate is $count gives a count, not an amount
  isCountCalculation: boolean;
  // The columns of a table query, in select order. null: the select has a *,
  // so only the rows give the columns.
  columns: AqlQueryColumn[] | null;
};

export type AqlQueryParseResult =
  | { query: ParsedAqlQuery; error?: undefined }
  | { query?: undefined; error: string };

// The text is JSON with one key for each q() method, for example
// {"table": "transactions", "filter": {"amount": {"$lt": 0}}}. The query is
// made with the same method calls, so it never has the raw or withDead
// options.
export function parseAqlQuery(text: string): AqlQueryParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      error: `The query is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!isPlainObject(json)) {
    return {
      error:
        'The query must be a JSON object, for example {"table": "transactions"}',
    };
  }

  const unknownKey = Object.keys(json).find(key => !aqlQueryKeys.includes(key));
  if (unknownKey !== undefined) {
    return {
      error: `Unknown key "${unknownKey}". Use ${aqlQueryKeys.join(', ')}`,
    };
  }

  const { table } = json;
  if (typeof table !== 'string') {
    return { error: 'Give the table, for example "table": "transactions"' };
  }
  if (!isAqlQueryTable(table)) {
    return {
      error: `Formulas cannot read the table "${table}". Use ${aqlQueryTables.join(', ')}`,
    };
  }

  const hasRows = ['select', 'groupBy', 'orderBy', 'limit', 'offset'].some(
    key => key in json,
  );
  if ('calculate' in json && hasRows) {
    return {
      error:
        'A query with calculate gives one value, so it cannot also have select, groupBy, orderBy, limit or offset',
    };
  }

  let query = q(table);

  if ('options' in json) {
    const { options } = json;
    if (!isPlainObject(options)) {
      return {
        error: 'options must be an object, for example {"splits": "none"}',
      };
    }
    const unknownOption = Object.keys(options).find(key => key !== 'splits');
    if (unknownOption !== undefined) {
      return { error: `Unknown option "${unknownOption}". Use splits` };
    }
    if (
      'splits' in options &&
      !aqlSplitOptions.includes(String(options.splits))
    ) {
      return {
        error: `splits must be ${aqlSplitOptions.map(option => `"${option}"`).join(', ')}`,
      };
    }
    query = query.options(options);
  }

  if ('filter' in json) {
    const filters = Array.isArray(json.filter) ? json.filter : [json.filter];
    if (!filters.every(isPlainObject)) {
      return {
        error:
          'filter must be an object, or a list of objects that all must match',
      };
    }
    for (const filter of filters) {
      query = query.filter(filter);
    }
  }

  for (const key of ['groupBy', 'select', 'orderBy'] as const) {
    if (!(key in json)) continue;
    const expressions = json[key];
    if (!isExpressionList(expressions)) {
      return {
        error: `${key} must be a field name, an object, or a list of them`,
      };
    }
    query = query[key](expressions);
  }

  for (const key of ['limit', 'offset'] as const) {
    if (!(key in json)) continue;
    const count = json[key];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      return { error: `${key} must be a whole number, 0 or more` };
    }
    query = query[key](count);
  }

  if ('calculate' in json) {
    const { calculate } = json;
    if (typeof calculate !== 'string' && !isPlainObject(calculate)) {
      return {
        error: 'calculate must be an object, for example {"$sum": "$amount"}',
      };
    }
    return {
      query: {
        kind: 'value',
        table,
        query: query.calculate(calculate),
        isCountCalculation:
          isPlainObject(calculate) && Object.keys(calculate)[0] === '$count',
        columns: null,
      },
    };
  }

  const isFilter = table === 'transactions' && !hasRows;
  return {
    query: {
      kind: isFilter ? 'filter' : 'table',
      table,
      // A table without select gives all fields
      query: isFilter || 'select' in json ? query : query.select('*'),
      isCountCalculation: false,
      columns:
        !isFilter && isExpressionList(json.select)
          ? getSelectColumns(json.select)
          : null,
    },
  };
}

// A select item is a field name, which is also the column name, or an object
// with the column name as its key. null: a field name has a *.
function getSelectColumns(
  select: ObjectExpression | string | Array<ObjectExpression | string>,
): AqlQueryColumn[] | null {
  const items = Array.isArray(select) ? select : [select];
  if (items.some(item => typeof item === 'string' && item.includes('*'))) {
    return null;
  }
  return items.flatMap(item =>
    typeof item === 'string'
      ? [{ name: item, usesAmount: isAmountField(item) }]
      : Object.entries(item).map(([name, expression]) => ({
          name,
          usesAmount:
            typeof expression === 'string'
              ? isAmountField(expression)
              : usesAmountField(expression),
        })),
  );
}

// "amount" or a path that ends in it, such as "parent.amount"
export function isAmountField(field: string) {
  return field === 'amount' || field.endsWith('.amount');
}

// A field in an expression starts with $, for example {"$sum": "$amount"}.
// Other text is a value.
function usesAmountField(expression: unknown): boolean {
  if (typeof expression === 'string') {
    return expression.startsWith('$') && isAmountField(expression.slice(1));
  }
  if (Array.isArray(expression)) {
    return expression.some(usesAmountField);
  }
  if (isPlainObject(expression)) {
    return Object.values(expression).some(usesAmountField);
  }
  return false;
}

function isAqlQueryTable(
  table: string,
): table is (typeof aqlQueryTables)[number] {
  return aqlQueryTables.some(allowedTable => allowedTable === table);
}

function isPlainObject(value: unknown): value is ObjectExpression {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExpression(value: unknown): value is ObjectExpression | string {
  return typeof value === 'string' || isPlainObject(value);
}

function isExpressionList(
  value: unknown,
): value is ObjectExpression | string | Array<ObjectExpression | string> {
  return Array.isArray(value)
    ? value.length > 0 && value.every(isExpression)
    : isExpression(value);
}
