import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { listen } from '@actual-app/core/platform/client/connection';
import type { ServerEvents } from '@actual-app/core/types/server-events';
import { useQuery } from '@tanstack/react-query';

import { executeFormula } from '#components/formula/executeFormula';
import type { SimpleAccount } from '#components/formula/executeFormula';
import { resolveQuery } from '#components/formula/resolveQuery';
import { formulaLibraryQueries } from '#formula-library';
import type {
  FormulaIssue,
  FormulaQueryConfig,
} from '#components/formula/resolveQuery';

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
) {
  const [language] = useGlobalPref('language');
  const [result, setResult] = useState<number | string | null>(null);
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

  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const namedExpressionsRef = useRef(namedExpressions);
  namedExpressionsRef.current = namedExpressions;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const libraryRef = useRef(library);
  libraryRef.current = library;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Most cards have no color formula, so this is not worth a log entry
      if (!formula || !formula.startsWith('=')) {
        setResult(null);
        setError('Formula must start with =');
        setIssues(NO_ISSUES);
        setIsLoading(false);
        return;
      }

      // Without the library, library queries would show as not found
      const library = libraryRef.current;
      if (!library) {
        setIsLoading(true);
        return;
      }

      const localQueries = queriesRef.current ?? {};

      setIsLoading(true);

      try {
        const execution = await executeFormula({
          formula,
          resolveQuery: name => resolveQuery(name, { localQueries, library }),
          accounts: accountsRef.current ?? [],
          namedExpressions: namedExpressionsRef.current,
          language,
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
        setError(errorMessages.length > 0 ? errorMessages.join('; ') : null);
        setIssues(execution.issues);
      } catch (err) {
        if (cancelled) return;
        console.error('Formula execution error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setResult(null);
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
    dataVersion,
  ]);

  return { result, isLoading, error, issues };
}
