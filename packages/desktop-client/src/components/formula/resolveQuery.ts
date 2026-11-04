import { isSameQueryName } from '@actual-app/core/shared/formulas/queryNameUses';
import type {
  FormulaLibraryItemEntity,
  FormulaLibraryQueryEntity,
  FormulaTimeFrameOverride,
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
    | 'missing-provider'
    | 'provider-cycle'
    | 'provider-error'
    | 'table-result'
    // Only the editor shows it
    | 'large-table'
    // Only the editor shows it. A value does not fit its format.
    | 'unformattable'
    // The table shows only part of the result
    | 'table-cut'
    | 'shadowed'
    | 'duplicate-name'
    | 'stale-override';
  // The query, account or provider name as written in the formula
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
  // The card's time frames for library queries, keyed by library item id
  timeFrameOverrides?: Record<string, FormulaTimeFrameOverride>;
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
// Time frame order: the card override (library queries only), then the
// query's own time frame. A dashboard date range (#8996) will go between them.
export function resolveQuery(
  name: string,
  { localQueries, library, timeFrameOverrides = {} }: QueryResolverContext,
): QueryResolution {
  const localName = Object.hasOwn(localQueries, name)
    ? name
    : Object.keys(localQueries).find(queryName =>
        isSameQueryName(queryName, name),
      );
  const libraryMatches = library.filter(
    (item): item is FormulaLibraryQueryEntity =>
      item.type === 'query' && isSameQueryName(item.name, name),
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
                  'The card query "{{name}}" hides the library query',
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
    const override = Object.hasOwn(timeFrameOverrides, libraryItem.id)
      ? timeFrameOverrides[libraryItem.id]
      : undefined;
    const issues: FormulaIssue[] = [];
    if (libraryMatches.length > 1) {
      issues.push({
        severity: 'warning',
        kind: 'duplicate-name',
        name,
        message: t(
          'More than one library query is named "{{name}}". The oldest one is used',
          { name: libraryItem.name },
        ),
      });
    }
    // An override made for a library query that no longer has this name
    // (it was deleted, or an older query with the same name came from sync)
    if (
      !override &&
      Object.entries(timeFrameOverrides).some(
        ([libraryId, staleOverride]) =>
          libraryId !== libraryItem.id &&
          isSameQueryName(staleOverride.name, name),
      )
    ) {
      issues.push({
        severity: 'warning',
        kind: 'stale-override',
        name,
        message: t(
          'The card time frame for "{{name}}" is for a different library query',
          { name: libraryItem.name },
        ),
      });
    }
    return {
      query: {
        name: libraryItem.name,
        source: 'library',
        libraryId: libraryItem.id,
        config: {
          conditions,
          conditionsOp,
          timeFrame: override ? override.timeFrame : timeFrame,
        },
      },
      issues,
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

// The query names that a formula on this card can use, with the place each
// name comes from. A library name that a card query hides is not in the list.
// For library names with the same name, only the oldest is in the list.
export function listQueryNames({
  localQueries,
  library,
}: QueryResolverContext): Record<string, ResolvedQuery['source']> {
  const names: Record<string, ResolvedQuery['source']> = {};
  for (const name of Object.keys(localQueries)) {
    names[name] = 'local';
  }
  for (const item of library) {
    if (
      item.type === 'query' &&
      !Object.keys(names).some(name => isSameQueryName(name, item.name))
    ) {
      names[item.name] = 'library';
    }
  }
  return names;
}
