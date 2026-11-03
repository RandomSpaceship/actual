import { isSameQueryName } from '@actual-app/core/shared/formulas/queryNameUses';
import type {
  FormulaLibraryItemEntity,
  RuleConditionEntity,
  TimeFrame,
} from '@actual-app/core/types/models';
import { t } from 'i18next';

export type FormulaQueryConfig = {
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
  timeFrame?: Partial<TimeFrame>;
};

export type FormulaIssue = {
  severity: 'error' | 'warning';
  kind:
    | 'missing-query'
    | 'missing-account'
    | 'query-failed'
    | 'shadowed'
    | 'duplicate-name';
  // The query or account name as written in the formula
  name: string;
  message: string;
};

export type ResolvedQuery = {
  name: string;
  source: 'local' | 'library';
  libraryId?: FormulaLibraryItemEntity['id'];
  // The time frame is already resolved
  config: FormulaQueryConfig;
};

export type QueryResolution = {
  query: ResolvedQuery | null;
  issues: FormulaIssue[];
};

export type QueryResolver = (name: string) => QueryResolution;

export type QueryResolverContext = {
  localQueries: Record<string, FormulaQueryConfig>;
  // Oldest first
  library: FormulaLibraryItemEntity[];
};

// Formula text refers to a query by its name, for example QUERY("food").
// Formula text is the only place that uses names. Anything else that is
// stored and points at a query must use an id, so that a rename does not
// break it. For a library query, that is the library item id.
//
// Names are case-insensitive. A local query wins over a library query with
// the same name (with a warning). For local queries an exact match wins, so
// two local queries that differ only in case continue to work. For library
// queries the oldest item wins (with a warning), because the order must be
// the same on every device.
//
// Time frame order: the query's own time frame. A dashboard date range
// (#8996) will go before it, and a card override before that.
export function resolveQuery(
  name: string,
  { localQueries, library }: QueryResolverContext,
): QueryResolution {
  const localName = Object.hasOwn(localQueries, name)
    ? name
    : Object.keys(localQueries).find(queryName =>
        isSameQueryName(queryName, name),
      );
  const libraryMatches = library.filter(
    item => item.type === 'query' && isSameQueryName(item.name, name),
  );

  if (localName !== undefined) {
    return {
      query: {
        name: localName,
        source: 'local',
        config: localQueries[localName],
      },
      issues:
        libraryMatches.length > 0
          ? [
              {
                severity: 'warning',
                kind: 'shadowed',
                name,
                message: t(
                  'The card query "{{name}}" is used, not the library query with the same name',
                  { name: localName },
                ),
              },
            ]
          : [],
    };
  }

  const [libraryItem] = libraryMatches;
  if (libraryItem) {
    const { conditions, conditionsOp, timeFrame } = libraryItem.data;
    return {
      query: {
        name: libraryItem.name,
        source: 'library',
        libraryId: libraryItem.id,
        config: { conditions, conditionsOp, timeFrame },
      },
      issues:
        libraryMatches.length > 1
          ? [
              {
                severity: 'warning',
                kind: 'duplicate-name',
                name,
                message: t(
                  'More than one library query is named "{{name}}". The oldest one is used',
                  { name: libraryItem.name },
                ),
              },
            ]
          : [],
    };
  }

  return {
    query: null,
    issues: [
      {
        severity: 'error',
        kind: 'missing-query',
        name,
        message: t('Query "{{name}}" not found', { name }),
      },
    ],
  };
}
