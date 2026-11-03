import type {
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
  kind: 'missing-query' | 'missing-account' | 'query-failed';
  // The query or account name as written in the formula
  name: string;
  message: string;
};

export type ResolvedQuery = {
  name: string;
  source: 'local';
  // The time frame is already resolved
  config: FormulaQueryConfig;
};

export type QueryResolution = {
  query: ResolvedQuery | null;
  issues: FormulaIssue[];
};

export type QueryResolver = (name: string) => QueryResolution;

// Formula text refers to a query by its name, for example QUERY("food").
// Formula text is the only place that uses names. Anything else that is
// stored and points at a query must use an id, so that a rename does not
// break it.
//
// Names are case-insensitive. An exact match wins, so two local queries that
// differ only in case continue to work.
//
// Time frame order: the query's own time frame. A dashboard date range
// (#8996) will go before it, and a card override before that.
export function resolveQuery(
  name: string,
  context: { localQueries: Record<string, FormulaQueryConfig> },
): QueryResolution {
  const localName = Object.hasOwn(context.localQueries, name)
    ? name
    : Object.keys(context.localQueries).find(
        queryName => queryName.toLowerCase() === name.toLowerCase(),
      );

  if (localName === undefined) {
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

  return {
    query: {
      name: localName,
      source: 'local',
      config: context.localQueries[localName],
    },
    issues: [],
  };
}
