import type { TimeFrame } from './dashboard';
import type { RuleConditionEntity } from './rule';

export type FormulaLibraryQueryData = {
  description?: string;
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
  timeFrame?: Partial<TimeFrame>;
};

export type FormulaLibraryQueryEntity = {
  id: string;
  type: 'query';
  // Formulas refer to the item by name. Names are case-insensitive
  name: string;
  data: FormulaLibraryQueryData;
  // Set once at creation and the same on every device. The oldest item wins a
  // duplicate name
  created_at: number;
  tombstone?: boolean;
};

export type FormulaLibraryProviderData = {
  description?: string;
  // Starts with "="
  formula: string;
};

// A named formula. Other formulas use its name without quotes
export type FormulaLibraryProviderEntity = Omit<
  FormulaLibraryQueryEntity,
  'type' | 'data'
> & {
  type: 'provider';
  data: FormulaLibraryProviderData;
};

export type FormulaLibraryAqlQueryData = {
  description?: string;
  // JSON with one key for each q() method, as typed
  aql: string;
  // The date field that the time frame filters. Without it, the query has no
  // time frame. null: the user chose no date field.
  dateField?: string | null;
  timeFrame?: Partial<TimeFrame>;
  // A value query gives a count, not an amount
  isCount?: boolean;
};

// A query in AQL. Formulas use its name as the name of a filter query
export type FormulaLibraryAqlQueryEntity = Omit<
  FormulaLibraryQueryEntity,
  'type' | 'data'
> & {
  type: 'aql-query';
  data: FormulaLibraryAqlQueryData;
};

// The items that QUERY and the other query functions refer to
export type FormulaLibraryNamedQueryEntity =
  | FormulaLibraryQueryEntity
  | FormulaLibraryAqlQueryEntity;

export type FormulaLibraryItemEntity =
  | FormulaLibraryQueryEntity
  | FormulaLibraryAqlQueryEntity
  | FormulaLibraryProviderEntity;
