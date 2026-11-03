import {
  formulaUsesQueryName,
  isSameQueryName,
} from '@actual-app/core/shared/formulas/queryNameUses';
import type {
  DashboardPageEntity,
  DashboardWidgetEntity,
  FormulaLibraryItemEntity,
  FormulaLibraryQueryEntity,
  FormulaWidget,
} from '@actual-app/core/types/models';

export type FormulaQueryUse = {
  widgetId: FormulaWidget['id'];
  // Empty when the card has no name
  cardName: string;
  dashboardName: string;
  // The formula text that uses the query: the formula, the color formula or both
  formulas: string[];
};

function isFormulaWidget(
  widget: DashboardWidgetEntity,
): widget is FormulaWidget {
  return widget.type === 'formula-card';
}

// The cards that use a library query. A card with a local query of the same
// name does not use the library query. A name built at run time, for example
// QUERY("fo"&"od"), is not found.
export function findFormulaQueryUses(
  name: string,
  widgets: readonly DashboardWidgetEntity[],
  dashboardPages: readonly DashboardPageEntity[],
): FormulaQueryUse[] {
  const uses: FormulaQueryUse[] = [];

  for (const widget of widgets) {
    if (!isFormulaWidget(widget) || !widget.meta) continue;

    const { formula, colorFormula, queries = {} } = widget.meta;
    if (
      Object.keys(queries).some(localName => isSameQueryName(localName, name))
    ) {
      continue;
    }

    const formulas = [formula, colorFormula].filter(
      (text): text is string =>
        text !== undefined && formulaUsesQueryName(text, name),
    );
    if (formulas.length === 0) continue;

    uses.push({
      widgetId: widget.id,
      cardName: widget.meta.name ?? '',
      dashboardName:
        dashboardPages.find(page => page.id === widget.dashboard_page_id)
          ?.name ?? '',
      formulas,
    });
  }

  return uses.sort(
    (a, b) =>
      a.dashboardName.localeCompare(b.dashboardName) ||
      a.cardName.localeCompare(b.cardName),
  );
}

// True when an older library query has the same name. Formulas then use the
// older one, so this item has no uses. The library list is oldest first.
export function isOverriddenLibraryQuery(
  item: FormulaLibraryQueryEntity,
  library: readonly FormulaLibraryItemEntity[],
) {
  for (const libraryItem of library) {
    if (libraryItem.id === item.id) return false;
    if (
      libraryItem.type === 'query' &&
      isSameQueryName(libraryItem.name, item.name)
    ) {
      return true;
    }
  }
  return false;
}
