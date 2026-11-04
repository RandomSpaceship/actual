import { parseAqlQuery } from '@actual-app/core/shared/formulas/aqlQuery';
import { t } from 'i18next';

// What the AQL text gives, and where a formula can use it. error: the text
// does not parse.
export function describeAqlQuery(text: string): {
  label: string;
  error?: string;
} {
  const { query, error } = parseAqlQuery(text);
  if (error !== undefined) {
    return { label: t('Not valid'), error };
  }
  switch (query.kind) {
    case 'filter':
      return {
        label: t(
          'Filter query. It works in QUERY, QUERY_COUNT, QUERY_GROUP and QUERY_PIVOT',
        ),
      };
    case 'value':
      return { label: t('One value. It works in QUERY') };
    default:
      return { label: t('A table. It works in QUERY_TABLE') };
  }
}

// A short name for the kind, for the library list
export function getAqlQueryKindName(text: string) {
  const { query } = parseAqlQuery(text);
  if (!query) return t('Not valid');
  switch (query.kind) {
    case 'filter':
      return t('Filter');
    case 'value':
      return t('Value');
    default:
      return t('Table');
  }
}

// The text on one line, for a list. Text that does not parse stays as it is.
export function getAqlQueryOneLine(text: string) {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}
