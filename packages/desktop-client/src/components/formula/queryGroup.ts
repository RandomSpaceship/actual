import { send } from '@actual-app/core/platform/client/connection';
import type {
  QueryDateRange,
  QueryGroupDimension,
  QueryGroupRequest,
  QueryGroupRow,
} from '@actual-app/core/shared/formulas/customFunctions';
import * as monthUtils from '@actual-app/core/shared/months';
import type { ObjectExpression, Query } from '@actual-app/core/shared/query';
import { t } from 'i18next';

const dimensionExpressions: Record<QueryGroupDimension, ObjectExpression> = {
  category: { $id: '$category' },
  category_group: { $id: '$category.group' },
  payee: { $id: '$payee' },
  account: { $id: '$account' },
  month: { $month: '$date' },
  year: { $year: '$date' },
};

function isPeriodDimension(dimension: QueryGroupDimension) {
  return dimension === 'month' || dimension === 'year';
}

// The keys of one dimension, in budget order, and their names. The key of a
// transaction without the field (for example no category) is ''.
type DimensionKeys = {
  order: string[];
  names: Map<string, string>;
};

async function loadEntityKeys(
  dimension: QueryGroupDimension,
): Promise<DimensionKeys> {
  if (dimension === 'category' || dimension === 'category_group') {
    const { grouped } = await send('get-categories');
    const entities =
      dimension === 'category'
        ? grouped.flatMap(group => group.categories ?? [])
        : grouped;
    return {
      order: [...entities.map(entity => entity.id), ''],
      names: new Map([
        ...entities.map(entity => [entity.id, entity.name] as const),
        ['', t('Uncategorized')],
      ]),
    };
  }

  const accounts = await send('accounts-get');
  if (dimension === 'account') {
    // As the sidebar: open on budget, open off budget, closed
    const sidebarRank = (account: (typeof accounts)[number]) =>
      account.closed ? 2 : account.offbudget ? 1 : 0;
    const sorted = [...accounts].sort(
      (a, b) => sidebarRank(a) - sidebarRank(b),
    );
    return {
      order: sorted.map(account => account.id),
      names: new Map(sorted.map(account => [account.id, account.name])),
    };
  }

  // A transfer payee has the name of its account
  const accountNames = new Map(
    accounts.map(account => [account.id, account.name]),
  );
  const payees = (await send('payees-get')).map(payee => ({
    id: payee.id,
    name: payee.transfer_acct
      ? (accountNames.get(payee.transfer_acct) ?? payee.name)
      : payee.name,
  }));
  payees.sort((a, b) => a.name.localeCompare(b.name));
  return {
    order: [...payees.map(payee => payee.id), ''],
    names: new Map([
      ...payees.map(payee => [payee.id, payee.name] as const),
      ['', t('No payee')],
    ]),
  };
}

// Each period from the start to the end of the query time frame. Without a
// time frame, from the first to the last period with transactions.
function getPeriodKeys(
  dimension: 'month' | 'year',
  dateRange: QueryDateRange | null,
  seenKeys: string[],
): string[] {
  const sortedKeys = [...seenKeys].sort();
  const start = dateRange
    ? dimension === 'month'
      ? monthUtils.monthFromDate(dateRange.start)
      : monthUtils.yearFromDate(dateRange.start)
    : sortedKeys[0];
  const end = dateRange
    ? dimension === 'month'
      ? monthUtils.monthFromDate(dateRange.end)
      : monthUtils.yearFromDate(dateRange.end)
    : sortedKeys[sortedKeys.length - 1];
  if (start === undefined || end === undefined) return [];

  if (dimension === 'month') {
    return monthUtils.rangeInclusive(start, end);
  }
  const years: string[] = [];
  for (let year = Number(start); year <= Number(end); year++) {
    years.push(String(year));
  }
  return years;
}

// The keys that the table shows for one dimension, in budget order
async function getDimensionKeys(
  dimension: QueryGroupDimension,
  seenKeys: string[],
  dateRange: QueryDateRange | null,
): Promise<DimensionKeys> {
  if (dimension === 'month' || dimension === 'year') {
    const order = getPeriodKeys(dimension, dateRange, seenKeys);
    return { order, names: new Map(order.map(key => [key, key])) };
  }

  const { order, names } = await loadEntityKeys(dimension);
  const seen = new Set(seenKeys);
  // A key that the lists do not have (for example a deleted payee) comes last
  const unknownKeys = seenKeys.filter(key => !names.has(key)).sort();
  return {
    order: [...order.filter(key => seen.has(key)), ...unknownKeys],
    names,
  };
}

// A header row with the column names, then one row for each key of dimension
// 1. A cell without transactions is 0. asc and desc sort the rows by the row
// total. The columns stay in budget order (or name order).
function getWideRows(
  rowDimension: QueryGroupDimension,
  [rowKeys, columnKeys]: DimensionKeys[],
  values: Map<string, number>,
  sort: QueryGroupRequest['sort'],
): QueryGroupRow[] {
  const rows = rowKeys.order.map(rowKey => {
    const cells = columnKeys.order.map(
      columnKey => values.get(JSON.stringify([rowKey, columnKey])) ?? 0,
    );
    const total = cells.reduce((sum, cell) => sum + cell, 0);
    return { name: rowKeys.names.get(rowKey) ?? rowKey, cells, total };
  });
  if (sort === 'asc' || sort === 'desc') {
    // A tie keeps budget order, because the sort is stable
    const direction = sort === 'asc' ? 1 : -1;
    rows.sort((a, b) => direction * (a.total - b.total));
  }
  const headerRow = [
    getDimensionTitle(rowDimension),
    ...columnKeys.order.map(key => columnKeys.names.get(key) ?? key),
  ];
  return [headerRow, ...rows.map(row => [row.name, ...row.cells])];
}

// The title of the row-name column in a wide table
function getDimensionTitle(dimension: QueryGroupDimension): string {
  switch (dimension) {
    case 'category':
      return t('Category');
    case 'category_group':
      return t('Category group');
    case 'payee':
      return t('Payee');
    case 'account':
      return t('Account');
    case 'month':
      return t('Month');
    case 'year':
      return t('Year');
    default:
      return dimension;
  }
}

// The rows for a QUERY_GROUP, QUERY_GROUP_COUNT, QUERY_PIVOT or
// QUERY_PIVOT_COUNT call, with the sums as
// integers. A month or year dimension gives a row with 0 for each period
// without transactions.
export async function fetchQueryGroupRows({
  transactionsQuery,
  request,
  dateRange,
}: {
  transactionsQuery: Query;
  request: QueryGroupRequest;
  dateRange: QueryDateRange | null;
}): Promise<QueryGroupRow[]> {
  const { dimensions, measure, sort } = request;
  const expressions = dimensions.map(
    dimension => dimensionExpressions[dimension],
  );
  const groupedQuery = transactionsQuery.groupBy(expressions).select([
    ...expressions.map((expression, index) => ({
      [`key${index}`]: expression,
    })),
    { value: measure === 'sum' ? { $sum: '$amount' } : { $count: '$id' } },
  ]);
  const { data } = await send('query', groupedQuery.serialize());
  const groups = (data as Array<Record<string, unknown>>).map(group => ({
    keys: dimensions.map((_, index) => String(group[`key${index}`] ?? '')),
    value: Number(group.value) || 0,
  }));

  const values = new Map(
    groups.map(group => [JSON.stringify(group.keys), group.value]),
  );
  const dimensionKeys = await Promise.all(
    dimensions.map((dimension, index) =>
      getDimensionKeys(
        dimension,
        [...new Set(groups.map(group => group.keys[index]))],
        dateRange,
      ),
    ),
  );

  if (sort === 'name') {
    for (const [index, { order, names }] of dimensionKeys.entries()) {
      if (isPeriodDimension(dimensions[index])) continue;
      order.sort((a, b) =>
        (names.get(a) ?? a).localeCompare(names.get(b) ?? b),
      );
    }
  }

  if (request.shape === 'wide') {
    return getWideRows(dimensions[0], dimensionKeys, values, sort);
  }

  // With a period dimension, each combination gets a row. Without one, only
  // the combinations with transactions.
  const hasPeriod = dimensions.some(isPeriodDimension);
  let rowKeys: string[][] = [[]];
  for (const { order } of dimensionKeys) {
    rowKeys = rowKeys.flatMap(keys => order.map(key => [...keys, key]));
  }
  const rows = rowKeys
    .map(keys => ({ keys, value: values.get(JSON.stringify(keys)) }))
    .filter(row => hasPeriod || row.value !== undefined)
    .map(row => ({ keys: row.keys, value: row.value ?? 0 }));

  if (sort === 'asc' || sort === 'desc') {
    // By the dimension-1 total, so that the rows of a group stay together
    const direction = sort === 'asc' ? 1 : -1;
    const totals = new Map<string, number>();
    const positions = new Map<string, number>();
    for (const row of rows) {
      totals.set(row.keys[0], (totals.get(row.keys[0]) ?? 0) + row.value);
      if (!positions.has(row.keys[0])) {
        positions.set(row.keys[0], positions.size);
      }
    }
    // A tie keeps budget order. Periods in a group stay in date order.
    const sortsInGroup =
      dimensions.length > 1 && !isPeriodDimension(dimensions[1]);
    const groupOf = (row: (typeof rows)[number]) => ({
      total: totals.get(row.keys[0]) ?? 0,
      position: positions.get(row.keys[0]) ?? 0,
    });
    rows.sort((a, b) => {
      const groupA = groupOf(a);
      const groupB = groupOf(b);
      return (
        direction * (groupA.total - groupB.total) ||
        groupA.position - groupB.position ||
        (sortsInGroup ? direction * (a.value - b.value) : 0)
      );
    });
  }

  return rows.map(row => [
    ...row.keys.map((key, index) => dimensionKeys[index].names.get(key) ?? key),
    row.value,
  ]);
}
