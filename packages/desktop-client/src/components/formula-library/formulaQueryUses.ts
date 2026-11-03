import { formulaUsesProviderName } from '@actual-app/core/shared/formulas/providerNameUses';
import {
  formulaUsesQueryName,
  isSameQueryName,
} from '@actual-app/core/shared/formulas/queryNameUses';
import type {
  DashboardPageEntity,
  DashboardWidgetEntity,
  FormulaLibraryItemEntity,
  FormulaLibraryProviderEntity,
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

function formulaUsesItemName(
  type: FormulaLibraryItemEntity['type'],
  formula: string,
  name: string,
) {
  return type === 'provider'
    ? formulaUsesProviderName(formula, name)
    : formulaUsesQueryName(formula, name);
}

// The cards that use a library query or provider. A card with a local query of
// the same name does not use the library query. A query name built at run
// time, for example QUERY("fo"&"od"), is not found. A card that uses the item
// only through a provider is not in the list.
export function findFormulaQueryUses(
  { type, name }: Pick<FormulaLibraryItemEntity, 'type' | 'name'>,
  widgets: readonly DashboardWidgetEntity[],
  dashboardPages: readonly DashboardPageEntity[],
): FormulaQueryUse[] {
  const uses: FormulaQueryUse[] = [];

  for (const widget of widgets) {
    if (!isFormulaWidget(widget) || !widget.meta) continue;

    const { formula, colorFormula, queries = {} } = widget.meta;
    if (
      type === 'query' &&
      Object.keys(queries).some(localName => isSameQueryName(localName, name))
    ) {
      continue;
    }

    const formulas = [formula, colorFormula].filter(
      (text): text is string =>
        text !== undefined && formulaUsesItemName(type, text, name),
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

// The library providers whose formula uses a library query or provider
export function findProviderUses(
  item: Pick<FormulaLibraryItemEntity, 'id' | 'type' | 'name'>,
  library: readonly FormulaLibraryItemEntity[],
): FormulaLibraryProviderEntity[] {
  return library
    .filter(
      (provider): provider is FormulaLibraryProviderEntity =>
        provider.type === 'provider' &&
        provider.id !== item.id &&
        formulaUsesItemName(item.type, provider.data.formula, item.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

// True when an older library item of the same type has the same name.
// Formulas then use the older one, so this item has no uses. The library list
// is oldest first.
export function isOverriddenLibraryItem(
  item: FormulaLibraryItemEntity,
  library: readonly FormulaLibraryItemEntity[],
) {
  for (const libraryItem of library) {
    if (libraryItem.id === item.id) return false;
    if (
      libraryItem.type === item.type &&
      isSameQueryName(libraryItem.name, item.name)
    ) {
      return true;
    }
  }
  return false;
}
