import {
  ArraySize,
  CellError,
  EmptyValue,
  ErrorType,
  FunctionArgumentType,
  FunctionPlugin,
  SimpleRangeValue,
} from 'hyperformula';
import type { InterpreterState } from 'hyperformula/typings/interpreter/InterpreterState';
import type { ProcedureAst } from 'hyperformula/typings/parser';

import { getCurrency } from '#shared/currencies';
import type { Currency } from '#shared/currencies';
import { integerToAmount } from '#shared/util';
import type { NumberFormats } from '#shared/util';

type CurrencySymbolPosition = 'before' | 'after';

export type BudgetQueryRequest = {
  dimension: string;
  categoryIds: string[];
  startMonth: string;
  endMonth: string;
};

// The days that a query filter includes, with both ends counted in days.
// null: the query has no time frame.
export type QueryDateRange = { start: string; end: string; days: number };

export const queryGroupDimensions = [
  'category',
  'category_group',
  'payee',
  'account',
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const;
export type QueryGroupDimension = (typeof queryGroupDimensions)[number];

export const queryGroupSorts = ['budget', 'name', 'asc', 'desc'] as const;
export type QueryGroupSort = (typeof queryGroupSorts)[number];

// A QUERY_GROUP, QUERY_GROUP_COUNT, QUERY_PIVOT or QUERY_PIVOT_COUNT call. 'long' gives one row
// for each group. 'wide' gives a header row, then one row for each key of
// dimension 1, with one column for each key of dimension 2.
export type QueryGroupRequest = {
  queryName: string;
  dimensions: QueryGroupDimension[];
  sort: QueryGroupSort;
  measure: 'sum' | 'count';
  shape: 'long' | 'wide';
};

// Long: the name of each dimension, then the sum or the count. Wide: the
// name of the row, then the sum for each column.
export type QueryGroupRow = Array<string | number>;

export type FormulaQueryContext = {
  queryNames?: Set<string>;
  queryCountNames?: Set<string>;
  queryExtractCategoryNames?: Set<string>;
  queryExtractTimeframeStartNames?: Set<string>;
  queryExtractTimeframeEndNames?: Set<string>;
  queryDateRangeNames?: Set<string>;
  balanceOfNames?: Set<string>;
  budgetQueryRequests?: Map<string, BudgetQueryRequest>;
  querySumPrefetch?: Map<string, number>;
  queryCountPrefetch?: Map<string, number>;
  queryExtractCategoriesPrefetch?: Map<string, string[]>;
  queryExtractTimeframeStartPrefetch?: Map<string, string>;
  queryExtractTimeframeEndPrefetch?: Map<string, string>;
  queryDateRangePrefetch?: Map<string, QueryDateRange | null>;
  balanceOfPrefetch?: Map<string, number>;
  budgetQueryPrefetch?: Map<string, number>;
  budgetQueryErrors?: Map<string, string>;
  // Keyed by createQueryGroupPrefetchKey
  queryGroupRequests?: Map<string, QueryGroupRequest>;
  queryGroupPrefetch?: Map<string, QueryGroupRow[]>;
};

type CustomFunctionsContext = {
  balanceOfPrefetch?: Map<string, number>;
  formulaQuery?: FormulaQueryContext;
};

export type UserPreferences = {
  currency: Currency;
  numberFormat: NumberFormats;
  decimalPlaces: number;
  thousandsSeparator: string;
  decimalSeparator: string;
  locale: string;
  currencySymbolPosition: CurrencySymbolPosition;
  currencySpaceBetweenAmountAndSymbol: boolean;
};

let cachedUserPreferences: UserPreferences | null = null;

export function setCachedUserPreferences(prefs: UserPreferences): void {
  cachedUserPreferences = prefs;
}

export function clearCachedUserPreferences(): void {
  cachedUserPreferences = null;
}

function getUserPreferences(): UserPreferences {
  if (!cachedUserPreferences) {
    // If not loaded, use defaults
    return {
      currency: getCurrency('USD'),
      numberFormat: 'comma-dot',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      locale: 'en-US',
      currencySymbolPosition: 'before',
      currencySpaceBetweenAmountAndSymbol: false,
    };
  }
  return cachedUserPreferences;
}

export function createBudgetQueryPrefetchKey({
  dimension,
  categoryIds,
  startMonth,
  endMonth,
}: BudgetQueryRequest): string {
  return JSON.stringify({
    dimension: dimension.toLowerCase(),
    categoryIds,
    startMonth,
    endMonth,
  });
}

// "Category group", "category_group" and "CategoryGroup" are the same
function parseQueryGroupDimension(value: string) {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
  return queryGroupDimensions.find(
    dimension => dimension.replace('_', '') === normalized,
  );
}

// An empty dimension 2 or sort gives the default. A wide table must have
// dimension 2. Returns an error message for a bad argument.
export function createQueryGroupRequest(
  queryName: string,
  dimension1: string,
  dimension2: string,
  sort: string,
  measure: QueryGroupRequest['measure'],
  shape: QueryGroupRequest['shape'] = 'long',
): QueryGroupRequest | string {
  if (shape === 'wide' && dimension2 === '') {
    return 'Give a dimension for the columns, for example "month"';
  }
  const dimensions: QueryGroupDimension[] = [];
  for (const value of dimension2 === ''
    ? [dimension1]
    : [dimension1, dimension2]) {
    const dimension = parseQueryGroupDimension(value);
    if (!dimension) {
      return `Unknown dimension "${value}". Use one of: ${queryGroupDimensions.join(', ')}`;
    }
    if (dimensions.includes(dimension)) {
      return `The dimension "${value}" is in the formula two times`;
    }
    dimensions.push(dimension);
  }

  const sortValue = sort === '' ? 'budget' : sort.toLowerCase();
  const parsedSort = queryGroupSorts.find(candidate => candidate === sortValue);
  if (!parsedSort) {
    return `Unknown sort "${sort}". Use one of: ${queryGroupSorts.join(', ')}`;
  }

  return { queryName, dimensions, sort: parsedSort, measure, shape };
}

// HyperFormula needs the table size before it runs the function, so the
// arguments must be text in the formula. undefined: an argument is not text.
function getLiteralArgs(ast: ProcedureAst) {
  const args = ast.args.map(arg => {
    if (arg.type === 'STRING') return arg.value;
    if (arg.type === 'EMPTY') return '';
    return undefined;
  });
  return args.every(arg => arg !== undefined) ? args : undefined;
}

export function createQueryGroupPrefetchKey(request: QueryGroupRequest) {
  return JSON.stringify(request);
}

// A query without transactions gives one row with empty names and 0, because
// a table cannot have zero rows. A wide table also keeps its header row.
function getQueryGroupRowsOrEmpty(
  request: QueryGroupRequest,
  rows: QueryGroupRow[] | undefined,
): QueryGroupRow[] {
  if (rows && rows.length > 0) return rows;
  if (request.shape === 'wide') {
    return [
      ['', ''],
      ['', 0],
    ];
  }
  return [[...request.dimensions.map(() => ''), 0]];
}

function categoryRangeToIds(categories: SimpleRangeValue): string[] {
  return categories
    .valuesFromTopLeftCorner()
    .filter(
      value =>
        value !== EmptyValue &&
        !(value instanceof CellError) &&
        (typeof value === 'string' || typeof value === 'number'),
    )
    .flatMap(value => String(value).split(','))
    .map(value => value.trim())
    .filter(value => value.length > 0);
}

function categoryIdsToRange(categoryIds: string[]): SimpleRangeValue {
  return SimpleRangeValue.onlyValues(
    categoryIds.length > 0
      ? categoryIds.map(categoryId => [categoryId])
      : [['']],
  );
}

function formatCurrencyValue({
  value,
  currencySymbol,
  decimals,
  thousandsSeparator,
  decimalSeparator,
  currencySymbolPosition,
  currencySpaceBetweenAmountAndSymbol,
}: {
  value: number;
  currencySymbol: string;
  decimals: number;
  thousandsSeparator: string;
  decimalSeparator: string;
  currencySymbolPosition: CurrencySymbolPosition;
  currencySpaceBetweenAmountAndSymbol: boolean;
}): string {
  const isNegative = value < 0;
  const absNum = Math.abs(value);
  const fixedNum = absNum.toFixed(decimals);
  const [integerPart, decimalPart] = fixedNum.split('.');

  const formattedInteger = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    thousandsSeparator,
  );

  const formattedAmount =
    decimals > 0 && decimalPart
      ? `${formattedInteger}${decimalSeparator}${decimalPart}`
      : formattedInteger;

  const space = currencySpaceBetweenAmountAndSymbol ? '\u202F' : '';
  const formattedCurrency =
    currencySymbolPosition === 'after'
      ? `${formattedAmount}${space}${currencySymbol}`
      : `${currencySymbol}${space}${formattedAmount}`;

  return isNegative ? `-${formattedCurrency}` : formattedCurrency;
}

function getCurrencySymbolPositionFromArg(
  value: string | undefined,
  fallback: CurrencySymbolPosition,
): CurrencySymbolPosition {
  return value === 'before' || value === 'after' ? value : fallback;
}

export class CustomFunctionsPlugin extends FunctionPlugin {
  private getCustomFunctionsContext(): CustomFunctionsContext | undefined {
    return this.config.context as CustomFunctionsContext | undefined;
  }

  private getFormulaQueryContext(): FormulaQueryContext | undefined {
    return this.getCustomFunctionsContext()?.formulaQuery;
  }

  integerToAmount(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('INTEGER_TO_AMOUNT'),
      (integerAmount: number, decimalPlaces: number = 2) => {
        return integerToAmount(integerAmount, decimalPlaces);
      },
    );
  }

  fixed(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('FIXED'),
      (number: number, decimals: number = 0) => {
        return Number(number).toFixed(decimals);
      },
    );
  }

  balanceOf(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('BALANCE_OF'),
      (accountKey: string) => {
        const ctx = this.getCustomFunctionsContext();
        if (ctx?.balanceOfPrefetch) {
          // Rule formulas: prefetched relative to the transaction being evaluated.
          return ctx.balanceOfPrefetch.get(accountKey) ?? 0;
        }

        // Report/query formulas: no single transaction to be "before", so this
        // resolves to the account's current balance.
        const formulaQueryCtx = this.getFormulaQueryContext();
        formulaQueryCtx?.balanceOfNames?.add(accountKey);
        return formulaQueryCtx?.balanceOfPrefetch?.get(accountKey) ?? 0;
      },
    );
  }

  query(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY'),
      (queryName: string) => {
        const ctx = this.getFormulaQueryContext();
        ctx?.queryNames?.add(queryName);
        return ctx?.querySumPrefetch?.get(queryName) ?? 0;
      },
    );
  }

  queryCount(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_COUNT'),
      (queryName: string) => {
        const ctx = this.getFormulaQueryContext();
        ctx?.queryCountNames?.add(queryName);
        return ctx?.queryCountPrefetch?.get(queryName) ?? 0;
      },
    );
  }

  queryExtractCategories(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_EXTRACT_CATEGORIES'),
      (queryName: string) => {
        const ctx = this.getFormulaQueryContext();
        ctx?.queryExtractCategoryNames?.add(queryName);
        return categoryIdsToRange(
          ctx?.queryExtractCategoriesPrefetch?.get(queryName) ?? [],
        );
      },
    );
  }

  queryExtractCategoriesSize(ast: ProcedureAst): ArraySize {
    if (ast.args.length !== 1) {
      return ArraySize.error();
    }

    const [queryNameAst] = ast.args;
    const queryName =
      queryNameAst.type === 'STRING' ? queryNameAst.value : undefined;
    const categoryCount = queryName
      ? this.getFormulaQueryContext()?.queryExtractCategoriesPrefetch?.get(
          queryName,
        )?.length
      : undefined;

    return new ArraySize(1, Math.max(categoryCount ?? 1, 1));
  }

  queryExtractTimeframeStart(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_EXTRACT_TIMEFRAME_START'),
      (queryName: string) => {
        const ctx = this.getFormulaQueryContext();
        ctx?.queryExtractTimeframeStartNames?.add(queryName);
        return ctx?.queryExtractTimeframeStartPrefetch?.get(queryName) ?? '';
      },
    );
  }

  queryExtractTimeframeEnd(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_EXTRACT_TIMEFRAME_END'),
      (queryName: string) => {
        const ctx = this.getFormulaQueryContext();
        ctx?.queryExtractTimeframeEndNames?.add(queryName);
        return ctx?.queryExtractTimeframeEndPrefetch?.get(queryName) ?? '';
      },
    );
  }

  private getQueryDateRange(queryName: string) {
    const ctx = this.getFormulaQueryContext();
    ctx?.queryDateRangeNames?.add(queryName);
    return ctx?.queryDateRangePrefetch?.get(queryName);
  }

  queryStartDate(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_START_DATE'),
      (queryName: string) => this.getQueryDateRange(queryName)?.start ?? '',
    );
  }

  queryEndDate(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_END_DATE'),
      (queryName: string) => this.getQueryDateRange(queryName)?.end ?? '',
    );
  }

  queryDays(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('QUERY_DAYS'),
      (queryName: string) => {
        const range = this.getQueryDateRange(queryName);
        // undefined: not fetched yet
        if (range === null) {
          return new CellError(ErrorType.VALUE, 'The query has no time frame');
        }
        return range?.days ?? 0;
      },
    );
  }

  private queryGroupFor(
    ast: ProcedureAst,
    state: InterpreterState,
    functionName:
      | 'QUERY_GROUP'
      | 'QUERY_GROUP_COUNT'
      | 'QUERY_PIVOT'
      | 'QUERY_PIVOT_COUNT',
    measure: QueryGroupRequest['measure'],
    shape: QueryGroupRequest['shape'],
  ) {
    if (!getLiteralArgs(ast)) {
      return new CellError(
        ErrorType.VALUE,
        `The arguments of ${functionName} must be text in the formula, for example "category"`,
      );
    }
    return this.runFunction(
      ast.args,
      state,
      this.metadata(functionName),
      (
        queryName: string,
        dimension1: string,
        dimension2: string,
        sort: string,
      ) => {
        const request = createQueryGroupRequest(
          queryName,
          dimension1,
          dimension2,
          sort,
          measure,
          shape,
        );
        if (typeof request === 'string') {
          return new CellError(ErrorType.VALUE, request);
        }
        const ctx = this.getFormulaQueryContext();
        const key = createQueryGroupPrefetchKey(request);
        ctx?.queryGroupRequests?.set(key, request);
        return SimpleRangeValue.onlyValues(
          getQueryGroupRowsOrEmpty(request, ctx?.queryGroupPrefetch?.get(key)),
        );
      },
    );
  }

  // The size comes from the fetched rows. A bad argument gives one cell for
  // the error.
  private queryGroupSizeFor(
    ast: ProcedureAst,
    measure: QueryGroupRequest['measure'],
    shape: QueryGroupRequest['shape'],
  ): ArraySize {
    const args = getLiteralArgs(ast);
    if (!args || args.length < 2 || args.length > 4) {
      return ArraySize.scalar();
    }
    const [queryName, dimension1, dimension2 = '', sort = ''] = args;

    const request = createQueryGroupRequest(
      queryName,
      dimension1,
      dimension2,
      sort,
      measure,
      shape,
    );
    if (typeof request === 'string') {
      return ArraySize.scalar();
    }
    const rows = getQueryGroupRowsOrEmpty(
      request,
      this.getFormulaQueryContext()?.queryGroupPrefetch?.get(
        createQueryGroupPrefetchKey(request),
      ),
    );
    return new ArraySize(rows[0].length, rows.length);
  }

  queryGroup(ast: ProcedureAst, state: InterpreterState) {
    return this.queryGroupFor(ast, state, 'QUERY_GROUP', 'sum', 'long');
  }

  queryGroupSize(ast: ProcedureAst): ArraySize {
    return this.queryGroupSizeFor(ast, 'sum', 'long');
  }

  queryGroupCount(ast: ProcedureAst, state: InterpreterState) {
    return this.queryGroupFor(ast, state, 'QUERY_GROUP_COUNT', 'count', 'long');
  }

  queryGroupCountSize(ast: ProcedureAst): ArraySize {
    return this.queryGroupSizeFor(ast, 'count', 'long');
  }

  queryPivot(ast: ProcedureAst, state: InterpreterState) {
    return this.queryGroupFor(ast, state, 'QUERY_PIVOT', 'sum', 'wide');
  }

  queryPivotSize(ast: ProcedureAst): ArraySize {
    return this.queryGroupSizeFor(ast, 'sum', 'wide');
  }

  queryPivotCount(ast: ProcedureAst, state: InterpreterState) {
    return this.queryGroupFor(ast, state, 'QUERY_PIVOT_COUNT', 'count', 'wide');
  }

  queryPivotCountSize(ast: ProcedureAst): ArraySize {
    return this.queryGroupSizeFor(ast, 'count', 'wide');
  }

  budgetQuery(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('BUDGET_QUERY'),
      (
        dimension: string,
        categories: SimpleRangeValue,
        startMonth: string,
        endMonth: string,
      ) => {
        const ctx = this.getFormulaQueryContext();
        const request: BudgetQueryRequest = {
          dimension: dimension.toLowerCase(),
          categoryIds: categoryRangeToIds(categories),
          startMonth,
          endMonth,
        };
        const key = createBudgetQueryPrefetchKey(request);
        ctx?.budgetQueryRequests?.set(key, request);
        const error = ctx?.budgetQueryErrors?.get(key);
        if (error) {
          return new CellError(ErrorType.VALUE, error);
        }
        return ctx?.budgetQueryPrefetch?.get(key) ?? 0;
      },
    );
  }

  formatNumber(ast: ProcedureAst, state: InterpreterState) {
    const hasDecimalsArg = ast.args.length > 1;
    const hasThousandsSeparatorArg = ast.args.length > 2;
    const hasDecimalSeparatorArg = ast.args.length > 3;

    return this.runFunction(
      ast.args,
      state,
      this.metadata('FORMATNUMBER'),
      (
        value: number,
        decimals?: number,
        thousandsSeparator?: string,
        decimalSeparator?: string,
      ) => {
        const num = Number(value);
        if (isNaN(num)) {
          return new CellError(ErrorType.VALUE);
        }

        const prefs = getUserPreferences();

        const actualThousandsSeparator =
          hasThousandsSeparatorArg && thousandsSeparator !== undefined
            ? thousandsSeparator
            : prefs.thousandsSeparator;
        const actualDecimalSeparator =
          hasDecimalSeparatorArg && decimalSeparator !== undefined
            ? decimalSeparator
            : prefs.decimalSeparator;
        const actualDecimals = hasDecimalsArg
          ? (decimals ?? 2)
          : prefs.decimalPlaces;

        const fixedNum = num.toFixed(actualDecimals);
        const [integerPart, decimalPart] = fixedNum.split('.');

        const formattedInteger = integerPart.replace(
          /\B(?=(\d{3})+(?!\d))/g,
          actualThousandsSeparator,
        );

        if (actualDecimals > 0 && decimalPart) {
          return `${formattedInteger}${actualDecimalSeparator}${decimalPart}`;
        }

        return formattedInteger;
      },
    );
  }

  formatCurrency(ast: ProcedureAst, state: InterpreterState) {
    const hasCurrencySymbolArg = ast.args.length > 1;
    const hasDecimalsArg = ast.args.length > 2;
    const hasThousandsSeparatorArg = ast.args.length > 3;
    const hasDecimalSeparatorArg = ast.args.length > 4;
    const hasCurrencySymbolPositionArg = ast.args.length > 5;
    const hasCurrencySpaceBetweenAmountAndSymbolArg = ast.args.length > 6;

    return this.runFunction(
      ast.args,
      state,
      this.metadata('FORMATCURRENCY'),
      (
        value: number,
        currencySymbol?: string,
        decimals?: number,
        thousandsSeparator?: string,
        decimalSeparator?: string,
        currencySymbolPosition?: string,
        currencySpaceBetweenAmountAndSymbol?: boolean,
      ) => {
        const num = Number(value);
        if (isNaN(num)) {
          return new CellError(ErrorType.VALUE);
        }

        const prefs = getUserPreferences();

        const actualCurrencySymbol = hasCurrencySymbolArg
          ? (currencySymbol ?? '')
          : prefs.currency.symbol;
        const actualDecimals = hasDecimalsArg
          ? (decimals ?? 2)
          : prefs.currency.decimalPlaces;
        const actualThousandsSeparator =
          hasThousandsSeparatorArg && thousandsSeparator !== undefined
            ? thousandsSeparator
            : prefs.thousandsSeparator;
        const actualDecimalSeparator =
          hasDecimalSeparatorArg && decimalSeparator !== undefined
            ? decimalSeparator
            : prefs.decimalSeparator;
        const actualCurrencySymbolPosition = hasCurrencySymbolPositionArg
          ? getCurrencySymbolPositionFromArg(
              currencySymbolPosition,
              prefs.currencySymbolPosition,
            )
          : prefs.currencySymbolPosition;
        const actualCurrencySpaceBetweenAmountAndSymbol =
          hasCurrencySpaceBetweenAmountAndSymbolArg &&
          currencySpaceBetweenAmountAndSymbol !== undefined
            ? currencySpaceBetweenAmountAndSymbol
            : prefs.currencySpaceBetweenAmountAndSymbol;

        return formatCurrencyValue({
          value: num,
          currencySymbol: actualCurrencySymbol,
          decimals: actualDecimals,
          thousandsSeparator: actualThousandsSeparator,
          decimalSeparator: actualDecimalSeparator,
          currencySymbolPosition: actualCurrencySymbolPosition,
          currencySpaceBetweenAmountAndSymbol:
            actualCurrencySpaceBetweenAmountAndSymbol,
        });
      },
    );
  }
}

CustomFunctionsPlugin.implementedFunctions = {
  BALANCE_OF: {
    method: 'balanceOf',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  FIXED: {
    method: 'fixed',
    parameters: [
      { argumentType: FunctionArgumentType.NUMBER },
      {
        argumentType: FunctionArgumentType.NUMBER,
        optionalArg: true,
        defaultValue: 0,
      },
    ],
  },
  INTEGER_TO_AMOUNT: {
    method: 'integerToAmount',
    parameters: [
      { argumentType: FunctionArgumentType.NUMBER },
      {
        argumentType: FunctionArgumentType.NUMBER,
        optionalArg: true,
        defaultValue: 2,
      },
    ],
  },
  QUERY: {
    method: 'query',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_COUNT: {
    method: 'queryCount',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_EXTRACT_CATEGORIES: {
    method: 'queryExtractCategories',
    sizeOfResultArrayMethod: 'queryExtractCategoriesSize',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_EXTRACT_TIMEFRAME_END: {
    method: 'queryExtractTimeframeEnd',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_EXTRACT_TIMEFRAME_START: {
    method: 'queryExtractTimeframeStart',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_START_DATE: {
    method: 'queryStartDate',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_END_DATE: {
    method: 'queryEndDate',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_DAYS: {
    method: 'queryDays',
    parameters: [{ argumentType: FunctionArgumentType.STRING }],
  },
  QUERY_GROUP: {
    method: 'queryGroup',
    sizeOfResultArrayMethod: 'queryGroupSize',
    parameters: [
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '',
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '',
      },
    ],
  },
  QUERY_GROUP_COUNT: {
    method: 'queryGroupCount',
    sizeOfResultArrayMethod: 'queryGroupCountSize',
    parameters: [
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '',
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '',
      },
    ],
  },
  QUERY_PIVOT: {
    method: 'queryPivot',
    sizeOfResultArrayMethod: 'queryPivotSize',
    parameters: [
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '',
      },
    ],
  },
  QUERY_PIVOT_COUNT: {
    method: 'queryPivotCount',
    sizeOfResultArrayMethod: 'queryPivotCountSize',
    parameters: [
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '',
      },
    ],
  },
  BUDGET_QUERY: {
    method: 'budgetQuery',
    parameters: [
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.STRING },
      { argumentType: FunctionArgumentType.STRING },
    ],
  },
  FORMATNUMBER: {
    method: 'formatNumber',
    parameters: [
      { argumentType: FunctionArgumentType.NUMBER },
      {
        argumentType: FunctionArgumentType.NUMBER,
        optionalArg: true,
        defaultValue: 2,
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: ',',
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '.',
      },
    ],
  },
  FORMATCURRENCY: {
    method: 'formatCurrency',
    parameters: [
      { argumentType: FunctionArgumentType.NUMBER },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '$',
      },
      {
        argumentType: FunctionArgumentType.NUMBER,
        optionalArg: true,
        defaultValue: 2,
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: ',',
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: '.',
      },
      {
        argumentType: FunctionArgumentType.STRING,
        optionalArg: true,
        defaultValue: 'before',
      },
      {
        argumentType: FunctionArgumentType.BOOLEAN,
        optionalArg: true,
        defaultValue: false,
      },
    ],
  },
};

export const customFunctionsTranslations = {
  enUS: {
    BALANCE_OF: 'BALANCE_OF',
    FIXED: 'FIXED',
    INTEGER_TO_AMOUNT: 'INTEGER_TO_AMOUNT',
    QUERY: 'QUERY',
    QUERY_COUNT: 'QUERY_COUNT',
    QUERY_EXTRACT_CATEGORIES: 'QUERY_EXTRACT_CATEGORIES',
    QUERY_EXTRACT_TIMEFRAME_END: 'QUERY_EXTRACT_TIMEFRAME_END',
    QUERY_EXTRACT_TIMEFRAME_START: 'QUERY_EXTRACT_TIMEFRAME_START',
    QUERY_START_DATE: 'QUERY_START_DATE',
    QUERY_END_DATE: 'QUERY_END_DATE',
    QUERY_DAYS: 'QUERY_DAYS',
    QUERY_GROUP: 'QUERY_GROUP',
    QUERY_GROUP_COUNT: 'QUERY_GROUP_COUNT',
    QUERY_PIVOT: 'QUERY_PIVOT',
    QUERY_PIVOT_COUNT: 'QUERY_PIVOT_COUNT',
    BUDGET_QUERY: 'BUDGET_QUERY',
    FORMATNUMBER: 'FORMATNUMBER',
    FORMATCURRENCY: 'FORMATCURRENCY',
  },
};
