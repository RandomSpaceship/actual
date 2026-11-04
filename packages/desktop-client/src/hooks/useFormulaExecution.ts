import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { listen } from '@actual-app/core/platform/client/connection';
import type { FormulaTimeFrameOverride } from '@actual-app/core/types/models';
import type { ServerEvents } from '@actual-app/core/types/server-events';
import { useQuery } from '@tanstack/react-query';

import { executeFormula } from '#components/formula/executeFormula';
import type {
  FormulaOutput,
  FormulaTable,
  SimpleAccount,
} from '#components/formula/executeFormula';
import { resolveQuery } from '#components/formula/resolveQuery';
import type {
  FormulaIssue,
  FormulaQueryConfig,
} from '#components/formula/resolveQuery';
import { formulaLibraryQueries } from '#formula-library';

import { useGlobalPref } from './useGlobalPref';

export type { SimpleAccount };

// A change to one of these tables can change a formula result
const FORMULA_DATA_TABLES = [
  'transactions',
  'accounts',
  'categories',
  'category_groups',
  'category_mapping',
  'payees',
  'payee_mapping',
  'zero_budgets',
  'reflect_budgets',
];

const NO_ISSUES: FormulaIssue[] = [];

export function useFormulaExecution(
  formula: string,
  queries: Record<string, FormulaQueryConfig>,
  queriesVersion?: number,
  namedExpressions?: Record<string, number | string>,
  accounts?: SimpleAccount[],
  // Keyed by library item id
  timeFrameOverrides?: Record<string, FormulaTimeFrameOverride>,
  output: FormulaOutput = 'value',
) {
  const [language] = useGlobalPref('language');
  const [result, setResult] = useState<number | string | null>(null);
  const [table, setTable] = useState<FormulaTable | null>(null);
  const [spills, setSpills] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<FormulaIssue[]>(NO_ISSUES);
  const [dataVersion, setDataVersion] = useState(0);
  // The library list is refetched when it changes, also from sync
  const libraryQuery = useQuery(formulaLibraryQueries.list());
  // If the library cannot be read, run without it: its queries show as not found
  const library = libraryQuery.isError ? [] : libraryQuery.data;

  const onSyncEvent = useEffectEvent((event: ServerEvents['sync-event']) => {
    if (
      event.type === 'applied' &&
      event.tables.some(table => FORMULA_DATA_TABLES.includes(table))
    ) {
      setDataVersion(version => version + 1);
    }
  });
  useEffect(() => listen('sync-event', onSyncEvent), []);

  // Callers pass `queries`/`namedExpressions`/`accounts` as plain objects, and
  // several of them build a fresh object on every render. Keying the effect on
  // the object identity would re-execute the formula on every render (and each
  // execution toggles `isLoading`, which renders again — an endless loop).
  // Depend on the serialized contents instead, and read the live objects
  // through refs.
  const queriesKey = JSON.stringify(queries ?? {});
  const namedExpressionsKey = JSON.stringify(namedExpressions ?? null);
  const accountsKey = JSON.stringify(accounts ?? null);
  const libraryKey = JSON.stringify(library ?? null);
  const timeFrameOverridesKey = JSON.stringify(timeFrameOverrides ?? null);

  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const namedExpressionsRef = useRef(namedExpressions);
  namedExpressionsRef.current = namedExpressions;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const timeFrameOverridesRef = useRef(timeFrameOverrides);
  timeFrameOverridesRef.current = timeFrameOverrides;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Most cards have no color formula, so this is not worth a log entry
      if (!formula || !formula.startsWith('=')) {
        setResult(null);
        setTable(null);
        setError('Formula must start with =');
        setIssues(NO_ISSUES);
        setIsLoading(false);
        return;
      }

      // Without the library, library queries and providers would show as
      // not found
      const library = libraryRef.current;
      if (!library) {
        setIsLoading(true);
        return;
      }

      const localQueries = queriesRef.current ?? {};
      const timeFrameOverrides = timeFrameOverridesRef.current;

      setIsLoading(true);

      try {
        const execution = await executeFormula({
          formula,
          resolveQuery: name =>
            resolveQuery(name, { localQueries, library, timeFrameOverrides }),
          accounts: accountsRef.current ?? [],
          namedExpressions: namedExpressionsRef.current,
          library,
          language,
          output,
        });

        if (cancelled) return;

        const errorMessages = execution.issues
          .filter(issue => issue.severity === 'error')
          .map(issue => issue.message);

        setResult(
          errorMessages.length > 0
            ? null
            : (execution.value as number | string | null),
        );
        setTable(errorMessages.length > 0 ? null : (execution.table ?? null));
        setSpills(execution.spills ?? false);
        setError(errorMessages.length > 0 ? errorMessages.join('; ') : null);
        setIssues(execution.issues);
      } catch (err) {
        if (cancelled) return;
        console.error('Formula execution error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setResult(null);
        setTable(null);
        setSpills(false);
        setIssues(NO_ISSUES);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    formula,
    queriesVersion,
    language,
    queriesKey,
    namedExpressionsKey,
    accountsKey,
    libraryKey,
    timeFrameOverridesKey,
    dataVersion,
    output,
  ]);

  return { result, table, spills, isLoading, error, issues };
}
