import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { formulaLibraryQueries } from '#formula-library';
import { dashboardQueries } from '#reports';

import {
  findFormulaQueryUses,
  findNamedFormulaUses,
  isOverriddenLibraryItem,
} from './formulaQueryUses';

// The cards and the named formulas that use a library item
export function useFindFormulaQueryUses() {
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const { data: widgets = [] } = useQuery(
    dashboardQueries.listDashboardWidgets(),
  );
  const { data: dashboardPages = [] } = useQuery(
    dashboardQueries.listDashboardPages(),
  );

  return (item: FormulaLibraryItemEntity) =>
    isOverriddenLibraryItem(item, library)
      ? { cards: [], namedFormulas: [] }
      : {
          cards: findFormulaQueryUses(item, widgets, dashboardPages),
          namedFormulas: findNamedFormulaUses(item, library),
        };
}
