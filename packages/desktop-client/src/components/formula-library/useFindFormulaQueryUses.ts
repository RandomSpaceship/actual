import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { formulaLibraryQueries } from '#formula-library';
import { dashboardQueries } from '#reports';

import {
  findFormulaQueryUses,
  isOverriddenLibraryQuery,
} from './formulaQueryUses';

export function useFindFormulaQueryUses() {
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const { data: widgets = [] } = useQuery(
    dashboardQueries.listDashboardWidgets(),
  );
  const { data: dashboardPages = [] } = useQuery(
    dashboardQueries.listDashboardPages(),
  );

  return (item: FormulaLibraryQueryEntity) =>
    isOverriddenLibraryQuery(item, library)
      ? []
      : findFormulaQueryUses(item.name, widgets, dashboardPages);
}
