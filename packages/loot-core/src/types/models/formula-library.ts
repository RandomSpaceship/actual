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

// Providers will join this union
export type FormulaLibraryItemEntity = FormulaLibraryQueryEntity;
