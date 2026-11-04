import { send } from '@actual-app/core/platform/client/connection';
import {
  createBudgetQueryPrefetchKey,
  setCachedUserPreferences,
} from '@actual-app/core/shared/formulas/customFunctions';
import type {
  FormulaQueryContext,
  QueryDateRange,
  QueryGroupRequest,
  QueryGroupRow,
} from '@actual-app/core/shared/formulas/customFunctions';
import { findProviderNameReferences } from '@actual-app/core/shared/formulas/providerNameUses';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import { integerToAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  FormulaLibraryItemEntity,
  RuleConditionEntity,
} from '@actual-app/core/types/models';
import { HyperFormula } from 'hyperformula';
import { t } from 'i18next';

import {
  normalizeQueryTimeFrameEnd,
  normalizeQueryTimeFrameStart,
} from '#components/formula/queryTimeFrame';
import { resolveProviders } from '#components/formula/resolveProviders';
import type {
  CardProviders,
  ResolvedProvider,
} from '#components/formula/resolveProviders';
import type {
  FormulaIssue,
  FormulaQueryConfig,
  QueryResolver,
} from '#components/formula/resolveQuery';
import {
  asMonthSlidingTimeFrame,
  calculateTimeRange,
} from '#components/reports/reportRanges';
import { bootstrapHyperFormula } from '#util/bootstrapHyperFormula';

import {
  buildAqlFilterQuery,
  fetchAqlQueryCount,
  fetchAqlQueryValue,
  FormulaQueryError,
  getAqlDateField,
  getAqlNotSupportedError,
} from './aqlSource';
import { fetchQueryGroupRows } from './queryGroup';

bootstrapHyperFormula();

export type FormulaCellValue = number | string | boolean | null;

// A cell of a table result. An error cell gives the error text, for example
// #DIV/0!
export type FormulaTableCell = FormulaCellValue | { error: string };

// The rows of a table result
export type FormulaTable = FormulaTableCell[][];

// What the caller shows. A 'value' caller gets an error issue for a table
// result. A 'table' caller gets each result as a table, also a single value.
// 'auto' gives a table only for a formula that spills, and one value for
// other formulas
export type FormulaOutput = 'value' | 'table' | 'auto';

export type SimpleAccount = { id: string; name: string };

type AddIssue = (issue: FormulaIssue) => void;

// Formulas use amounts, the database stores integers. Do all conversions here,
// so that support for other currency decimal places (#9340) changes one place.
function integerToFormulaAmount(value: number): number {
  return integerToAmount(value, 2);
}

function createFormulaQueryContext(): Required<FormulaQueryContext> {
  return {
    queryNames: new Set(),
    queryCountNames: new Set(),
    queryExtractCategoryNames: new Set(),
    queryExtractTimeframeStartNames: new Set(),
    queryExtractTimeframeEndNames: new Set(),
    queryDateRangeNames: new Set(),
    balanceOfNames: new Set(),
    budgetQueryRequests: new Map(),
    querySumPrefetch: new Map(),
    queryCountPrefetch: new Map(),
    queryExtractCategoriesPrefetch: new Map(),
    queryExtractTimeframeStartPrefetch: new Map(),
    queryExtractTimeframeEndPrefetch: new Map(),
    queryDateRangePrefetch: new Map(),
    balanceOfPrefetch: new Map(),
    budgetQueryPrefetch: new Map(),
    budgetQueryErrors: new Map(),
    queryGroupRequests: new Map(),
    queryGroupPrefetch: new Map(),
  };
}

function isHyperFormulaError(
  cellValue: unknown,
): cellValue is { type: string; value?: string; message?: string } {
  return Boolean(
    cellValue && typeof cellValue === 'object' && 'type' in cellValue,
  );
}

function toTableCell(cellValue: unknown): FormulaTableCell {
  if (isHyperFormulaError(cellValue)) {
    return { error: cellValue.value ?? cellValue.type };
  }
  return cellValue as FormulaCellValue;
}

type FormulaEvaluation = {
  value: FormulaCellValue;
  // Only for a formula that spills into more than one cell
  table: FormulaTable | null;
  cellError: { type: string; message?: string } | null;
  // The error type of each provider whose value is an error
  providerErrors: Map<string, string>;
};

// The column letters of a 1-based column number, for example 28 gives AB
function toColumnLetters(columnNumber: number) {
  let letters = '';
  for (let rest = columnNumber; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

// The size of the cells with values. The sheet size can be larger: a function
// such as FILTER gets space for its largest result before it runs, and the
// unused cells stay empty.
function getUsedSize(
  hfInstance: ReturnType<typeof HyperFormula.buildEmpty>,
  sheetId: number,
) {
  const rows = hfInstance.getSheetValues(sheetId);
  return {
    width: Math.max(1, ...rows.map(row => row.length)),
    height: Math.max(1, rows.length),
  };
}

// Puts each provider after the providers that it uses. The resolver already
// stops a cycle, so a provider never uses itself.
function sortProvidersByUse(providers: ResolvedProvider[]) {
  const providersByKey = new Map(
    providers.map(provider => [provider.name.toUpperCase(), provider]),
  );
  const sorted: ResolvedProvider[] = [];
  const visited = new Set<string>();
  function visit(provider: ResolvedProvider) {
    const key = provider.name.toUpperCase();
    if (visited.has(key)) return;
    visited.add(key);
    for (const usedName of provider.uses) {
      const usedProvider = providersByKey.get(usedName.toUpperCase());
      if (usedProvider) visit(usedProvider);
    }
    sorted.push(provider);
  }
  providers.forEach(visit);
  return sorted;
}

// The range of a provider that gives a table, for each upper-case name
type ProviderTableRanges = Map<
  string,
  { range: string; rows: number; columns: number }
>;

// A formula in a cell can use a range, but not a named range, as a table:
// HyperFormula must know the size of a table when it parses the formula. Thus
// each name of a provider that gives a table changes to its range. When the
// name is all of the formula, the range alone gives #VALUE!, so
// ARRAY_CONSTRAIN makes it a table. Lookup functions such as VLOOKUP need a
// range, so other names stay a plain range.
function replaceTableProviderNames(
  formula: string,
  tableRanges: ProviderTableRanges,
) {
  const tableReferences = findProviderNameReferences(formula).flatMap(
    reference => {
      const tableRange = tableRanges.get(reference.name.toUpperCase());
      return tableRange ? [{ ...reference, ...tableRange }] : [];
    },
  );
  const [onlyReference] = tableReferences;
  if (
    tableReferences.length === 1 &&
    formula.slice(0, onlyReference.start).trim() === '=' &&
    formula.slice(onlyReference.end).trim() === ''
  ) {
    const { range, rows, columns } = onlyReference;
    return `=ARRAY_CONSTRAIN(${range}, ${rows}, ${columns})`;
  }

  let changed = formula;
  // Replace from the end, so that the earlier positions stay correct
  for (const reference of tableReferences.reverse()) {
    changed =
      changed.slice(0, reference.start) +
      reference.range +
      changed.slice(reference.end);
  }
  return changed;
}

// A named expression cannot hold a table. Thus each provider goes in cell A1
// of its own sheet. A provider that gives one value gets a named range to its
// cell. Formulas get the range of a provider that gives a table in place of
// its name. A provider must come after the providers that it uses, because
// their formulas change first.
function addProviders(
  hfInstance: ReturnType<typeof HyperFormula.buildEmpty>,
  providers: ResolvedProvider[],
) {
  // The error type of each provider whose value is one error
  const providerErrors = new Map<string, string>();
  const tableRanges: ProviderTableRanges = new Map();
  sortProvidersByUse(providers).forEach((provider, index) => {
    const providerSheetName = hfInstance.addSheet(`__provider_${index + 1}`);
    const providerSheetId = hfInstance.getSheetId(providerSheetName);
    if (providerSheetId === undefined) {
      throw new Error('Failed to create provider sheet');
    }
    const firstCell = { sheet: providerSheetId, col: 0, row: 0 };
    hfInstance.setCellContents(firstCell, [
      [replaceTableProviderNames(provider.formula, tableRanges)],
    ]);

    const firstCellReference = `'${providerSheetName}'!$A$1`;
    const { width, height } = getUsedSize(hfInstance, providerSheetId);
    if (width > 1 || height > 1) {
      tableRanges.set(provider.name.toUpperCase(), {
        range: `${firstCellReference}:$${toColumnLetters(width)}$${height}`,
        rows: height,
        columns: width,
      });
      return;
    }

    hfInstance.addNamedExpression(provider.name, `=${firstCellReference}`);
    const providerValue = hfInstance.getCellValue(firstCell);
    if (isHyperFormulaError(providerValue)) {
      providerErrors.set(
        provider.name.toUpperCase(),
        providerValue.value ?? providerValue.type,
      );
    }
  });
  return { providerErrors, tableRanges };
}

function evaluateFormulaWithContext({
  formula,
  formulaQueryContext,
  locale,
  namedExpressions,
  providers,
}: {
  formula: string;
  formulaQueryContext: FormulaQueryContext;
  locale: string;
  namedExpressions?: Record<string, number | string>;
  providers: ResolvedProvider[];
}): FormulaEvaluation {
  let hfInstance: ReturnType<typeof HyperFormula.buildEmpty> | null = null;

  try {
    hfInstance = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
      language: 'enUS',
      localeLang: locale,
      dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD'],
      context: {
        formulaQuery: formulaQueryContext,
      },
    });

    const sheetName = hfInstance.addSheet('Sheet1');
    const sheetId = hfInstance.getSheetId(sheetName);

    if (sheetId === undefined) {
      throw new Error('Failed to create sheet');
    }

    if (namedExpressions) {
      for (const [name, value] of Object.entries(namedExpressions)) {
        hfInstance.addNamedExpression(
          name,
          typeof value === 'number' ? value : String(value),
        );
      }
    }

    const { providerErrors, tableRanges } = addProviders(hfInstance, providers);

    hfInstance.setCellContents({ sheet: sheetId, col: 0, row: 0 }, [
      [replaceTableProviderNames(formula, tableRanges)],
    ]);

    const cellValue = hfInstance.getCellValue({
      sheet: sheetId,
      col: 0,
      row: 0,
    });

    if (isHyperFormulaError(cellValue)) {
      return {
        value: null,
        table: null,
        cellError: cellValue,
        providerErrors,
      };
    }

    const { width, height } = getUsedSize(hfInstance, sheetId);
    const table =
      width > 1 || height > 1
        ? hfInstance
            .getSheetValues(sheetId)
            .map(row => row.map(cell => toTableCell(cell)))
        : null;

    return {
      value: table ? null : (cellValue as FormulaCellValue),
      table,
      cellError: null,
      providerErrors,
    };
  } finally {
    hfInstance?.destroy();
  }
}

// The provider that gives an error of its own, and does not only pass on an
// error from a provider that it uses
function findProviderWithError(
  providers: ResolvedProvider[],
  providerErrors: Map<string, string>,
) {
  return providers.find(
    provider =>
      providerErrors.has(provider.name.toUpperCase()) &&
      !provider.uses.some(name => providerErrors.has(name.toUpperCase())),
  );
}

// A formula that keeps asking for new data stops after this many passes
const MAX_EVALUATION_PASSES = 20;

// Runs a formula card formula. HyperFormula is synchronous, so the formula is
// evaluated more than once. Each pass collects the names and requests that
// the formula asks for, then their data is fetched for the next pass. Query
// and account data comes first, because BUDGET_QUERY requests can depend on
// it. The pass that asks for nothing new gives the value. A normal formula
// takes three passes. A provider can ask for data too, so it can add passes.
//
// Problems with names (an unknown query, account or provider, or providers
// that use each other) and failed fetches are returned as issues. An error
// issue replaces the value. A provider whose value is an error also gives an
// error issue. A provider can give a table, as a formula can. Other formula
// errors, and a formula that does not start with "=", throw.
//
// A formula that spills into more than one cell gives a table. For the
// 'value' output, a table is an error issue.
export async function executeFormula({
  formula,
  resolveQuery,
  accounts,
  namedExpressions,
  library = [],
  cardProviders = {},
  language,
  output = 'value',
}: {
  formula: string;
  resolveQuery: QueryResolver;
  accounts: SimpleAccount[];
  namedExpressions?: Record<string, number | string>;
  // Oldest first. The formula can use its providers
  library?: FormulaLibraryItemEntity[];
  // They win over library providers with the same name
  cardProviders?: CardProviders;
  // The language global preference
  language?: string;
  output?: FormulaOutput;
}): Promise<{
  value: FormulaCellValue;
  // Only for a table result, or for each result of the 'table' output
  table?: FormulaTable;
  // The formula gives a table, in each output. The 'auto' output shows a
  // table only then.
  spills?: boolean;
  issues: FormulaIssue[];
}> {
  if (!formula || !formula.startsWith('=')) {
    throw new Error('Formula must start with =');
  }

  const browserLocale =
    typeof navigator === 'undefined' ? undefined : navigator.language;
  const formulaLocale = language || browserLocale || 'en-US';

  try {
    setCachedUserPreferences(
      await send('formula-load-user-preferences', {
        selectedLocale: language,
        browserLocale,
      }),
    );
  } catch (err) {
    console.error('Error loading formula preferences:', err);
  }

  const issues: FormulaIssue[] = [];
  const addIssue: AddIssue = issue => {
    // A name used by more than one function gives one issue
    if (
      !issues.some(
        existing =>
          existing.kind === issue.kind && existing.name === issue.name,
      )
    ) {
      issues.push(issue);
    }
  };

  const resolvedProviders = resolveProviders(
    [formula],
    library,
    Object.keys(namedExpressions ?? {}),
    cardProviders,
  );
  resolvedProviders.issues.forEach(addIssue);
  if (issues.some(issue => issue.severity === 'error')) {
    return { value: null, issues };
  }

  const formulaQueryContext = createFormulaQueryContext();
  const evaluate = () =>
    evaluateFormulaWithContext({
      formula,
      formulaQueryContext,
      locale: formulaLocale,
      namedExpressions,
      providers: resolvedProviders.providers,
    });

  let evaluation = evaluate();
  for (let pass = 1; pass < MAX_EVALUATION_PASSES; pass++) {
    const fetchCount =
      (await prefetchFormulaQueries(
        formulaQueryContext,
        resolveQuery,
        addIssue,
      )) +
      (await prefetchAccountBalances(formulaQueryContext, accounts, addIssue)) +
      (await prefetchQueryGroups(formulaQueryContext, resolveQuery, addIssue));
    if (
      fetchCount === 0 &&
      (await prefetchBudgetQueries(formulaQueryContext)) === 0
    ) {
      break;
    }

    formulaQueryContext.budgetQueryRequests.clear();
    evaluation = evaluate();
  }

  if (issues.some(issue => issue.severity === 'error')) {
    return { value: null, issues };
  }

  if (evaluation.cellError) {
    const provider = findProviderWithError(
      resolvedProviders.providers,
      evaluation.providerErrors,
    );
    if (!provider) {
      const { type, message } = evaluation.cellError;
      throw new Error(
        message
          ? `Formula error: ${type}. ${message}`
          : `Formula error: ${type}`,
      );
    }
    addIssue({
      severity: 'error',
      kind: 'provider-error',
      name: provider.name,
      message: t('Provider "{{name}}" gives the error {{error}}', {
        name: provider.name,
        error: evaluation.providerErrors.get(provider.name.toUpperCase()),
      }),
    });
    return { value: null, issues };
  }

  // Only set for a table, so that a result with one value stays the same
  const spills = evaluation.table ? true : undefined;
  if (evaluation.table && output !== 'value') {
    addTableCutIssue(evaluation.table, addIssue);
  }

  if (output === 'table') {
    return {
      value: evaluation.value,
      table: evaluation.table ?? [[evaluation.value]],
      spills,
      issues,
    };
  }

  if (output === 'auto') {
    return evaluation.table
      ? { value: null, table: evaluation.table, spills, issues }
      : { value: evaluation.value, spills, issues };
  }

  if (evaluation.table) {
    addIssue({
      severity: 'error',
      kind: 'table-result',
      name: '',
      message: t(
        'The formula gives a table, not one value. Set Display to Automatic or Table, or use INDEX to get one cell, for example INDEX(formula, 1, 2)',
      ),
    });
    return { value: null, table: evaluation.table, spills, issues };
  }

  return { value: evaluation.value, spills, issues };
}

async function prefetchQueryValues<T>({
  names,
  prefetch,
  fallback,
  resolveQuery,
  addIssue,
  fetchValue,
}: {
  names: Set<string>;
  prefetch: Map<string, T>;
  // Used when the query is unknown or fails. The value is never shown, because
  // the error replaces it, but the formula still needs a value to evaluate.
  fallback: T;
  resolveQuery: QueryResolver;
  addIssue: AddIssue;
  fetchValue: (config: FormulaQueryConfig) => Promise<T>;
}) {
  let fetchCount = 0;
  for (const queryName of names) {
    if (prefetch.has(queryName)) continue;
    fetchCount++;

    const { query, issues } = resolveQuery(queryName);
    issues.forEach(addIssue);

    if (!query) {
      prefetch.set(queryName, fallback);
      continue;
    }

    try {
      prefetch.set(queryName, await fetchValue(query.config));
    } catch (err) {
      console.error(`Error running query "${queryName}":`, err);
      addIssue(getQueryFailedIssue(queryName, err));
      prefetch.set(queryName, fallback);
    }
  }
  return fetchCount;
}

function getQueryFailedIssue(queryName: string, err: unknown): FormulaIssue {
  return {
    severity: 'error',
    kind: 'query-failed',
    name: queryName,
    message:
      err instanceof FormulaQueryError
        ? t('Query "{{name}}": {{message}}', {
            name: queryName,
            message: err.message,
          })
        : t('Query "{{name}}" could not run', { name: queryName }),
  };
}

// Returns the number of names that were not fetched before
async function prefetchFormulaQueries(
  formulaQueryContext: Required<FormulaQueryContext>,
  resolveQuery: QueryResolver,
  addIssue: AddIssue,
) {
  const common = { resolveQuery, addIssue };
  let fetchCount = 0;

  fetchCount += await prefetchQueryValues({
    ...common,
    names: formulaQueryContext.queryNames,
    prefetch: formulaQueryContext.querySumPrefetch,
    fallback: 0,
    fetchValue: async config => {
      if (!config.aql) {
        return integerToFormulaAmount(await fetchQuerySum(config));
      }
      const { value, isAmount } = await fetchAqlQueryValue(
        config.aql,
        getQueryDateRange(config),
      );
      return isAmount ? integerToFormulaAmount(value) : value;
    },
  });

  fetchCount += await prefetchQueryValues({
    ...common,
    names: formulaQueryContext.queryCountNames,
    prefetch: formulaQueryContext.queryCountPrefetch,
    fallback: 0,
    fetchValue: config =>
      config.aql
        ? fetchAqlQueryCount(config.aql, getQueryDateRange(config))
        : fetchQueryCount(config),
  });

  fetchCount += await prefetchQueryValues({
    ...common,
    names: formulaQueryContext.queryExtractCategoryNames,
    prefetch: formulaQueryContext.queryExtractCategoriesPrefetch,
    fallback: [],
    fetchValue: async config => {
      if (config.aql) throw getAqlNotSupportedError('QUERY_EXTRACT_CATEGORIES');
      return extractQueryCategories(config);
    },
  });

  fetchCount += await prefetchQueryValues({
    ...common,
    names: formulaQueryContext.queryExtractTimeframeStartNames,
    prefetch: formulaQueryContext.queryExtractTimeframeStartPrefetch,
    fallback: monthUtils.currentMonth(),
    fetchValue: async config => {
      if (config.aql) {
        throw getAqlNotSupportedError('QUERY_EXTRACT_TIMEFRAME_START');
      }
      return extractQueryTimeframeStart(config);
    },
  });

  fetchCount += await prefetchQueryValues({
    ...common,
    names: formulaQueryContext.queryExtractTimeframeEndNames,
    prefetch: formulaQueryContext.queryExtractTimeframeEndPrefetch,
    fallback: monthUtils.currentMonth(),
    fetchValue: async config => {
      if (config.aql) {
        throw getAqlNotSupportedError('QUERY_EXTRACT_TIMEFRAME_END');
      }
      return extractQueryTimeframeEnd(config);
    },
  });

  fetchCount += await prefetchQueryValues({
    ...common,
    names: formulaQueryContext.queryDateRangeNames,
    prefetch: formulaQueryContext.queryDateRangePrefetch,
    fallback: null,
    fetchValue: async config => getQueryDateRange(config),
  });

  return fetchCount;
}

// Returns the number of requests that were not fetched before
async function prefetchQueryGroups(
  formulaQueryContext: Required<FormulaQueryContext>,
  resolveQuery: QueryResolver,
  addIssue: AddIssue,
) {
  let fetchCount = 0;
  for (const [key, request] of formulaQueryContext.queryGroupRequests) {
    if (formulaQueryContext.queryGroupPrefetch.has(key)) continue;
    fetchCount++;
    formulaQueryContext.queryGroupPrefetch.set(key, []);

    const { query, issues } = resolveQuery(request.queryName);
    issues.forEach(addIssue);
    if (!query) continue;

    try {
      const rows = await fetchQueryGroupRows({
        transactionsQuery: await buildFilteredTransactionsQuery(query.config),
        request,
        dateRange: getQueryDateRange(query.config),
      });
      addLargeTableIssue(request, rows, addIssue);
      formulaQueryContext.queryGroupPrefetch.set(
        key,
        // The names are text, so each number is a sum or a count
        request.measure === 'sum'
          ? rows.map(row =>
              row.map(cell =>
                typeof cell === 'number' ? integerToFormulaAmount(cell) : cell,
              ),
            )
          : rows,
      );
    } catch (err) {
      console.error(`Error running query "${request.queryName}":`, err);
      addIssue(getQueryFailedIssue(request.queryName, err));
    }
  }
  return fetchCount;
}

// The table view shows at most this part of a table. The formula still gets
// all of it.
export const maxShownTableRows = 500;
export const maxShownTableColumns = 60;

function addTableCutIssue(table: FormulaTable, addIssue: AddIssue) {
  const rowCount = table.length;
  const columnCount = Math.max(0, ...table.map(row => row.length));
  if (rowCount <= maxShownTableRows && columnCount <= maxShownTableColumns) {
    return;
  }
  const values = {
    shownRows: Math.min(rowCount, maxShownTableRows),
    rowCount,
    shownColumns: Math.min(columnCount, maxShownTableColumns),
    columnCount,
  };
  const isRowsCut = rowCount > maxShownTableRows;
  const isColumnsCut = columnCount > maxShownTableColumns;
  addIssue({
    severity: 'warning',
    kind: 'table-cut',
    name: '',
    message:
      isRowsCut && isColumnsCut
        ? t(
            'The table shows {{shownRows}} of {{rowCount}} rows and {{shownColumns}} of {{columnCount}} columns. The totals use all of them.',
            values,
          )
        : isRowsCut
          ? t(
              'The table shows {{shownRows}} of {{rowCount}} rows. The totals use all of them.',
              values,
            )
          : t(
              'The table shows {{shownColumns}} of {{columnCount}} columns. The totals use all of them.',
              values,
            ),
  });
}

// Over these sizes, a table is hard to read on a card and slow to show
const largeTableRows = 50;
const largeTableColumns = 20;

function addLargeTableIssue(
  request: QueryGroupRequest,
  rows: QueryGroupRow[],
  addIssue: AddIssue,
) {
  // A wide table has a header row and a name column
  const isWide = request.shape === 'wide';
  const rowCount = isWide ? rows.length - 1 : rows.length;
  const columnCount = isWide ? (rows[0]?.length ?? 1) - 1 : 0;
  if (rowCount <= largeTableRows && columnCount <= largeTableColumns) return;
  addIssue({
    severity: 'warning',
    kind: 'large-table',
    name: request.queryName,
    message: isWide
      ? t(
          'The table for query "{{name}}" has {{rowCount}} rows and {{columnCount}} columns. A table with more than {{largeTableRows}} rows or {{largeTableColumns}} columns is hard to read and slow to show.',
          {
            name: request.queryName,
            rowCount,
            columnCount,
            largeTableRows,
            largeTableColumns,
          },
        )
      : t(
          'The table for query "{{name}}" has {{rowCount}} rows. A table with more than {{largeTableRows}} rows is hard to read and slow to show.',
          { name: request.queryName, rowCount, largeTableRows },
        ),
  });
}

// Returns the number of accounts that were not fetched before
async function prefetchAccountBalances(
  formulaQueryContext: Required<FormulaQueryContext>,
  accounts: SimpleAccount[],
  addIssue: AddIssue,
) {
  let fetchCount = 0;
  for (const literal of formulaQueryContext.balanceOfNames) {
    if (formulaQueryContext.balanceOfPrefetch.has(literal)) continue;
    fetchCount++;
    formulaQueryContext.balanceOfPrefetch.set(literal, 0);

    const account =
      accounts.find(candidate => candidate.id === literal) ??
      accounts.find(candidate => candidate.name === literal);

    if (!account) {
      addIssue({
        severity: 'error',
        kind: 'missing-account',
        name: literal,
        message: t('Account "{{name}}" not found', { name: literal }),
      });
      continue;
    }

    try {
      formulaQueryContext.balanceOfPrefetch.set(
        literal,
        await fetchAccountBalance(account.id),
      );
    } catch (err) {
      console.error('Error fetching account balance:', err);
      addIssue({
        severity: 'error',
        kind: 'query-failed',
        name: literal,
        message: t('Balance of account "{{name}}" could not be read', {
          name: literal,
        }),
      });
    }
  }
  return fetchCount;
}

async function fetchAccountBalance(accountId: string): Promise<number> {
  const balanceQuery = q('transactions')
    .filter({ account: accountId })
    .calculate({ $sum: '$amount' });
  const { data } = await send('query', balanceQuery.serialize());
  return integerToFormulaAmount(data || 0);
}

// Returns the number of requests that were not fetched before
async function prefetchBudgetQueries(
  formulaQueryContext: Required<FormulaQueryContext>,
) {
  let fetchCount = 0;
  for (const request of formulaQueryContext.budgetQueryRequests.values()) {
    const key = createBudgetQueryPrefetchKey(request);
    if (
      formulaQueryContext.budgetQueryPrefetch.has(key) ||
      formulaQueryContext.budgetQueryErrors.has(key)
    ) {
      continue;
    }
    fetchCount++;

    try {
      formulaQueryContext.budgetQueryPrefetch.set(
        key,
        await fetchBudgetDimensionValueDirect(
          request.dimension,
          request.categoryIds,
          request.startMonth,
          request.endMonth,
        ),
      );
      formulaQueryContext.budgetQueryErrors.delete(key);
    } catch (err) {
      console.error('Error evaluating BUDGET_QUERY', err);
      formulaQueryContext.budgetQueryPrefetch.delete(key);
      formulaQueryContext.budgetQueryErrors.set(
        key,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return fetchCount;
}

// The days that the query filter includes, or null if the query has no time
// frame. The time frame of an AQL query applies only with a date field.
export function getQueryDateRange(
  config: FormulaQueryConfig,
): QueryDateRange | null {
  const timeFrame = config.timeFrame;
  if (!timeFrame || !timeFrame.mode) {
    return null;
  }
  if (config.aql && getAqlDateField(config.aql) === null) {
    return null;
  }

  const [calculatedStart, calculatedEnd] = calculateTimeRange(
    asMonthSlidingTimeFrame(timeFrame),
  );
  const start = normalizeQueryTimeFrameStart(calculatedStart);
  const end = normalizeQueryTimeFrameEnd(calculatedEnd);
  return {
    start,
    end,
    days: monthUtils.differenceInCalendarDays(end, start) + 1,
  };
}

export async function buildFilteredTransactionsQuery(
  config: FormulaQueryConfig,
): Promise<Query> {
  if (config.aql) {
    return buildAqlFilterQuery(config.aql, getQueryDateRange(config));
  }
  const conditions = config.conditions || [];
  const conditionsOp = config.conditionsOp || 'and';
  const dateRange = getQueryDateRange(config);

  // Convert conditions to query filters
  const { filters: queryFilters } = await send('make-filters-from-conditions', {
    conditions,
  });

  const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

  // Start building the query
  let transQuery = q('transactions');

  // Add date range filter if provided
  if (dateRange) {
    transQuery = transQuery.filter({
      $and: [
        { date: { $gte: dateRange.start } },
        { date: { $lte: dateRange.end } },
      ],
    });
  }

  // Add user-defined filters
  if (queryFilters.length > 0) {
    transQuery = transQuery.filter({ [conditionsOpKey]: queryFilters });
  }

  return transQuery;
}

async function fetchQuerySum(config: FormulaQueryConfig): Promise<number> {
  const transQuery = await buildFilteredTransactionsQuery(config);
  const summedQuery = transQuery.calculate({ $sum: '$amount' });
  const { data } = await send('query', summedQuery.serialize());
  return data || 0;
}

async function fetchQueryCount(config: FormulaQueryConfig): Promise<number> {
  const transQuery = await buildFilteredTransactionsQuery(config);
  const countQuery = transQuery.calculate({ $count: '*' });
  const { data } = await send('query', countQuery.serialize());
  return data || 0;
}
// Helper: Extract category-based conditions (ignore transaction-specific filters)
function extractCategoryConditions(
  conditions: RuleConditionEntity[],
): RuleConditionEntity[] {
  return conditions.filter(
    cond =>
      !cond.customName &&
      (cond.field === 'category' || cond.field === 'category_group'),
  );
}

// Helper: Evaluate category conditions to get matching categories
async function getCategoriesFromConditions(
  allCategories: CategoryEntity[],
  conditions: RuleConditionEntity[],
  conditionsOp: 'and' | 'or',
): Promise<string[]> {
  if (conditions.length === 0) {
    // No category filter: include all non-income, non-hidden categories
    return allCategories
      .filter((cat: CategoryEntity) => !cat.is_income && !cat.hidden)
      .map((cat: CategoryEntity) => cat.id);
  }

  // Get category groups for resolving group IDs to names
  const { grouped: categoryGroups } = await send('get-categories');
  const groupNameById = new Map(
    categoryGroups.map((g: { id: string; name: string }) => [g.id, g.name]),
  );

  // Evaluate each condition to get sets of matching categories
  const conditionResults = conditions.map(cond => {
    // For category_group conditions, we check cat.group; for category, we check cat.id
    const getKey = (cat: CategoryEntity) =>
      cond.field === 'category_group' ? cat.group : cat.id;

    const matching = allCategories.filter((cat: CategoryEntity) => {
      const key = getKey(cat);

      const textValue =
        cond.field === 'category_group'
          ? (groupNameById.get(key) ?? key)
          : cat.name;

      if (cond.op === 'is') {
        return cond.value === key;
      } else if (cond.op === 'isNot') {
        return cond.value !== key;
      } else if (cond.op === 'oneOf') {
        return cond.value.includes(key);
      } else if (cond.op === 'notOneOf') {
        return !cond.value.includes(key);
      } else if (cond.op === 'contains') {
        return textValue
          .toLowerCase()
          .includes((cond.value as string).toLowerCase());
      } else if (cond.op === 'doesNotContain') {
        return !textValue
          .toLowerCase()
          .includes((cond.value as string).toLowerCase());
      } else if (cond.op === 'matches') {
        try {
          return new RegExp(cond.value as string, 'i').test(textValue);
        } catch (e) {
          console.warn('Invalid regexp in matches condition', e);
          return false;
        }
      }
      // Unknown operator: exclude category by default and log warning
      console.warn(`Unknown category condition operator: ${cond.op}`);
      return false;
    });
    return matching.map((cat: CategoryEntity) => cat.id);
  });

  if (conditionsOp === 'or') {
    // OR: Union of all matching categories
    const categoryIds = new Set(conditionResults.flat());
    return Array.from(categoryIds);
  } else {
    // AND: Intersection of all matching categories
    if (conditionResults.length === 0) {
      return [];
    }
    const firstSet = new Set(conditionResults[0]);
    for (let i = 1; i < conditionResults.length; i++) {
      const currentIds = new Set(conditionResults[i]);
      // Keep only categories that are in both sets
      const toRemove: string[] = [];
      firstSet.forEach(id => {
        if (!currentIds.has(id)) {
          toRemove.push(id);
        }
      });
      toRemove.forEach(id => firstSet.delete(id));
    }
    return Array.from(firstSet);
  }
}

// Helper: Get month data from envelope-budget-month RPC
async function getMonthBudgetData(
  month: string,
): Promise<Array<{ name: string; value: string | number | boolean }>> {
  const monthData = await send('envelope-budget-month', { month });
  return monthData || [];
}

// Helper: Extract value from month data by field pattern
function getMonthDataValue(
  monthData: Array<{ name: string; value: string | number | boolean }>,
  pattern: string,
  catId: string,
): string | number | boolean {
  const fieldName = pattern.replace('{catId}', catId);
  const cell = monthData.find(c => c.name.endsWith(fieldName));
  return cell?.value ?? 0;
}

// Helper: Extract categories from a query (for QUERY_EXTRACT_CATEGORIES)
async function extractQueryCategories(
  queryConfig: FormulaQueryConfig,
): Promise<string[]> {
  const categoryConditions = extractCategoryConditions(
    queryConfig.conditions || [],
  );
  const { list: allCategories } = await send('get-categories');
  return getCategoriesFromConditions(
    allCategories,
    categoryConditions,
    queryConfig.conditionsOp || 'and',
  );
}

// Helper: Extract timeframe start month from a query (for QUERY_EXTRACT_TIMEFRAME_START)
function extractQueryTimeframeStart(queryConfig: FormulaQueryConfig): string {
  if (!queryConfig.timeFrame) {
    return monthUtils.currentMonth();
  }

  const [startMonth] = calculateTimeRange(
    asMonthSlidingTimeFrame(queryConfig.timeFrame),
  );
  return startMonth;
}

// Helper: Extract timeframe end month from a query (for QUERY_EXTRACT_TIMEFRAME_END)
function extractQueryTimeframeEnd(queryConfig: FormulaQueryConfig): string {
  if (!queryConfig.timeFrame) {
    return monthUtils.currentMonth();
  }

  const [, endMonth] = calculateTimeRange(
    asMonthSlidingTimeFrame(queryConfig.timeFrame),
  );
  return endMonth;
}

// Helper: Evaluate budget dimension with already-extracted parameters (used by compositional BUDGET_QUERY)
async function fetchBudgetDimensionValueDirect(
  dimension: string,
  categoryIds: string[],
  startMonth: string,
  endMonth: string,
): Promise<number> {
  const allowed = new Set([
    'budgeted',
    'spent',
    'balance_start',
    'balance_end',
    'goal',
  ]);
  const dim = dimension.toLowerCase();
  if (!allowed.has(dim)) {
    throw new Error(`Invalid BUDGET_QUERY dimension: ${dimension}`);
  }

  const intervals = monthUtils.rangeInclusive(startMonth, endMonth);

  // Helper: sum a dimension across all months/categories
  const sumDimension = async (fieldPattern: string): Promise<number> => {
    let total = 0;
    for (const month of intervals) {
      const monthData = await getMonthBudgetData(month);
      for (const catId of categoryIds) {
        total += getMonthDataValue(monthData, fieldPattern, catId) as number;
      }
    }
    return total;
  };

  if (dim === 'budgeted') {
    return integerToFormulaAmount(await sumDimension('budget-{catId}'));
  }

  if (dim === 'spent') {
    return integerToFormulaAmount(await sumDimension('sum-amount-{catId}'));
  }

  if (dim === 'goal') {
    return integerToFormulaAmount(await sumDimension('goal-{catId}'));
  }

  // Handle balance dimensions: chain month-by-month with carryover logic
  if (dim === 'balance_start' || dim === 'balance_end') {
    let runningBalance = 0;
    const monthBeforeStart = monthUtils.subMonths(startMonth, 1);
    const prevMonthData = await getMonthBudgetData(monthBeforeStart);

    for (const catId of categoryIds) {
      const catBalance = getMonthDataValue(
        prevMonthData,
        'leftover-{catId}',
        catId,
      ) as number;
      const hasCarryover = Boolean(
        getMonthDataValue(prevMonthData, 'carryover-{catId}', catId),
      );
      if (catBalance > 0 || (catBalance < 0 && hasCarryover)) {
        runningBalance += catBalance;
      }
    }

    const balances: Record<string, { start: number; end: number }> = {};

    for (const month of intervals) {
      const monthData = await getMonthBudgetData(month);
      let budgeted = 0;
      let spent = 0;
      let carryoverToNextMonth = 0;

      for (const catId of categoryIds) {
        const catBudgeted =
          Number(getMonthDataValue(monthData, 'budget-{catId}', catId)) || 0;
        const catSpent =
          Number(getMonthDataValue(monthData, 'sum-amount-{catId}', catId)) ||
          0;
        const catBalance =
          Number(getMonthDataValue(monthData, 'leftover-{catId}', catId)) || 0;
        const hasCarryover = Boolean(
          getMonthDataValue(monthData, 'carryover-{catId}', catId),
        );

        budgeted += catBudgeted;
        spent += catSpent;

        if (catBalance > 0 || (catBalance < 0 && hasCarryover)) {
          carryoverToNextMonth += catBalance;
        }
      }

      const balanceStart = runningBalance;
      const balanceEnd = budgeted + spent + runningBalance;

      balances[month] = { start: balanceStart, end: balanceEnd };
      runningBalance = carryoverToNextMonth;
    }

    if (dim === 'balance_start') {
      return integerToFormulaAmount(balances[intervals[0]]?.start || 0);
    }
    return integerToFormulaAmount(
      balances[intervals[intervals.length - 1]]?.end || 0,
    );
  }

  return 0;
}
