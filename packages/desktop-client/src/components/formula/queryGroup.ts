import { send } from '@actual-app/core/platform/client/connection';
import { isPeriodDimension } from '@actual-app/core/shared/formulas/customFunctions';
import type {
  QueryDateRange,
  QueryGroupDimension,
  QueryGroupPeriodDimension,
  QueryGroupRequest,
  QueryGroupRow,
  QueryGroupSort,
} from '@actual-app/core/shared/formulas/customFunctions';
import * as monthUtils from '@actual-app/core/shared/months';
import type { ObjectExpression, Query } from '@actual-app/core/shared/query';
import type { SyncedPrefs } from '@actual-app/core/types/prefs';
import { t } from 'i18next';

// AQL has no week or quarter, so a week groups by day and a quarter by
// month. groupPeriodKey then puts each key in its week or quarter.
const dimensionExpressions: Record<QueryGroupDimension, ObjectExpression> = {
  category: { $id: '$category' },
  category_group: { $id: '$category.group' },
  payee: { $id: '$payee' },
  account: { $id: '$account' },
  day: { $day: '$date' },
  week: { $day: '$date' },
  month: { $month: '$date' },
  quarter: { $month: '$date' },
  year: { $year: '$date' },
};

type FirstDayOfWeekIdx = SyncedPrefs['firstDayOfWeekIdx'];

// The key of the period that a database key is in: the first day of the
// week, or the first month of the quarter
function groupPeriodKey(
  dimension: QueryGroupDimension,
  key: string,
  firstDayOfWeekIdx: FirstDayOfWeekIdx,
): string {
  if (key === '') return key;
  if (dimension === 'week') {
    return monthUtils.weekFromDate(key, firstDayOfWeekIdx);
  }
  if (dimension === 'quarter') return monthUtils.quarterFromDate(key);
  return key;
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
  dimension: QueryGroupPeriodDimension,
  dateRange: QueryDateRange | null,
  seenKeys: string[],
  firstDayOfWeekIdx: FirstDayOfWeekIdx,
): string[] {
  const sortedKeys = [...seenKeys].sort();
  const toKey = (date: string) => {
    switch (dimension) {
      case 'day':
        return date;
      case 'week':
        return monthUtils.weekFromDate(date, firstDayOfWeekIdx);
      case 'month':
        return monthUtils.monthFromDate(date);
      case 'quarter':
        return monthUtils.quarterFromDate(date);
      default:
        return monthUtils.yearFromDate(date);
    }
  };
  const start = dateRange ? toKey(dateRange.start) : sortedKeys[0];
  const end = dateRange
    ? toKey(dateRange.end)
    : sortedKeys[sortedKeys.length - 1];
  if (start === undefined || end === undefined) return [];

  switch (dimension) {
    case 'day':
      return monthUtils.dayRangeInclusive(start, end);
    case 'week':
      return monthUtils.weekRangeInclusive(start, end, firstDayOfWeekIdx);
    case 'month':
      return monthUtils.rangeInclusive(start, end);
    case 'quarter':
      return monthUtils.quarterRangeInclusive(start, end);
    default: {
      const years: string[] = [];
      for (let year = Number(start); year <= Number(end); year++) {
        years.push(String(year));
      }
      return years;
    }
  }
}

// The name of a period key. A quarter key is its first month, so it gets a
// name of its own in the custom report format, for example "Q1 '24".
function getPeriodName(
  dimension: QueryGroupPeriodDimension,
  key: string,
): string {
  if (dimension !== 'quarter') return key;
  return monthUtils.format(key, "QQQ ''yy");
}

// The keys that the table shows for one dimension, in budget order
async function getDimensionKeys(
  dimension: QueryGroupDimension,
  seenKeys: string[],
  dateRange: QueryDateRange | null,
  firstDayOfWeekIdx: FirstDayOfWeekIdx,
): Promise<DimensionKeys> {
  if (isPeriodDimension(dimension)) {
    const order = getPeriodKeys(
      dimension,
      dateRange,
      seenKeys,
      firstDayOfWeekIdx,
    );
    return {
      order,
      names: new Map(order.map(key => [key, getPeriodName(dimension, key)])),
    };
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
  sort: QueryGroupSort,
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

// 1 for asc, -1 for desc, and 0 for a sort that does not use the values
function getValueSortDirection(sort: QueryGroupSort | undefined) {
  if (sort === 'asc') return 1;
  if (sort === 'desc') return -1;
  return 0;
}

// The title of the row-name column in a wide table
function getDimensionTitle(dimension: QueryGroupDimension): string {
  switch (dimension) {
    case 'category':
      return t('Category');
    case 'category_group':
      return t('Group');
    case 'payee':
      return t('Payee');
    case 'account':
      return t('Account');
    case 'day':
      return t('Day');
    case 'week':
      return t('Week');
    case 'month':
      return t('Month');
    case 'quarter':
      return t('Quarter');
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
  const { dimensions, measure, sorts } = request;
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
  const firstDayOfWeekIdx = dimensions.includes('week')
    ? ((await send('preferences/get'))?.firstDayOfWeekIdx ?? '0')
    : '0';
  const groups = (data as Array<Record<string, unknown>>).map(group => ({
    keys: dimensions.map((dimension, index) =>
      groupPeriodKey(
        dimension,
        String(group[`key${index}`] ?? ''),
        firstDayOfWeekIdx,
      ),
    ),
    value: Number(group.value) || 0,
  }));

  // The days of a week, or the months of a quarter, add up
  const values = new Map<string, number>();
  for (const group of groups) {
    const key = JSON.stringify(group.keys);
    values.set(key, (values.get(key) ?? 0) + group.value);
  }
  const dimensionKeys = await Promise.all(
    dimensions.map((dimension, index) =>
      getDimensionKeys(
        dimension,
        [...new Set(groups.map(group => group.keys[index]))],
        dateRange,
        firstDayOfWeekIdx,
      ),
    ),
  );

  // Periods stay in date order
  for (const [index, { order, names }] of dimensionKeys.entries()) {
    if (sorts[index] !== 'name' || isPeriodDimension(dimensions[index])) {
      continue;
    }
    order.sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b));
  }

  if (request.shape === 'wide') {
    return getWideRows(dimensions[0], dimensionKeys, values, sorts[0]);
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

  // asc and desc for dimension 1 sort by the group total, so that the rows of
  // a group stay together. For dimension 2, they sort inside each group. A
  // tie keeps budget order.
  const groupDirection = getValueSortDirection(sorts[0]);
  const rowDirection = getValueSortDirection(sorts[1]);
  if (groupDirection !== 0 || rowDirection !== 0) {
    const totals = new Map<string, number>();
    const positions = new Map<string, number>();
    for (const row of rows) {
      totals.set(row.keys[0], (totals.get(row.keys[0]) ?? 0) + row.value);
      if (!positions.has(row.keys[0])) {
        positions.set(row.keys[0], positions.size);
      }
    }
    const groupOf = (row: (typeof rows)[number]) => ({
      total: totals.get(row.keys[0]) ?? 0,
      position: positions.get(row.keys[0]) ?? 0,
    });
    rows.sort((a, b) => {
      const groupA = groupOf(a);
      const groupB = groupOf(b);
      return (
        groupDirection * (groupA.total - groupB.total) ||
        groupA.position - groupB.position ||
        rowDirection * (a.value - b.value)
      );
    });
  }

  return rows.map(row => [
    ...row.keys.map((key, index) => dimensionKeys[index].names.get(key) ?? key),
    row.value,
  ]);
}
