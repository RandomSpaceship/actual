import {
  formulaUsesNamedFormulaName,
  isSameNamedFormulaName,
} from '@actual-app/core/shared/formulas/namedFormulaNameUses';
import {
  formulaUsesQueryName,
  getLibraryNameKind,
  isSameQueryName,
} from '@actual-app/core/shared/formulas/queryNameUses';
import type {
  DashboardPageEntity,
  DashboardWidgetEntity,
  FormulaLibraryItemEntity,
  FormulaLibraryNamedFormulaEntity,
  FormulaWidget,
} from '@actual-app/core/types/models';

export type FormulaQueryUse = {
  widgetId: FormulaWidget['id'];
  // Empty when the card has no name
  cardName: string;
  dashboardName: string;
  // The formula text that uses the query: the formula, the color formula and
  // the card named formula formulas
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
  return type === 'named-formula'
    ? formulaUsesNamedFormulaName(formula, name)
    : formulaUsesQueryName(formula, name);
}

// The cards that use a library query or named formula, also in card named formulas. A
// card with a card query or card named formula of the same name does not use the
// library item. A query name built at run
// time, for example QUERY("fo"&"od"), is not found. A card that uses the item
// only through a named formula is not in the list.
export function findFormulaQueryUses(
  { type, name }: Pick<FormulaLibraryItemEntity, 'type' | 'name'>,
  widgets: readonly DashboardWidgetEntity[],
  dashboardPages: readonly DashboardPageEntity[],
): FormulaQueryUse[] {
  const uses: FormulaQueryUse[] = [];

  for (const widget of widgets) {
    if (!isFormulaWidget(widget) || !widget.meta) continue;

    const {
      formula,
      colorFormula,
      queries = {},
      namedFormulas: cardNamedFormulas = {},
    } = widget.meta;
    if (
      type !== 'named-formula'
        ? Object.keys(queries).some(localName =>
            isSameQueryName(localName, name),
          )
        : Object.keys(cardNamedFormulas).some(cardName =>
            isSameNamedFormulaName(cardName, name),
          )
    ) {
      continue;
    }

    const formulas = [
      formula,
      colorFormula,
      ...Object.values(cardNamedFormulas).map(
        namedFormula => namedFormula.formula,
      ),
    ].filter(
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

// The library named formulas whose formula uses a library query or named formula
export function findNamedFormulaUses(
  item: Pick<FormulaLibraryItemEntity, 'id' | 'type' | 'name'>,
  library: readonly FormulaLibraryItemEntity[],
): FormulaLibraryNamedFormulaEntity[] {
  return library
    .filter(
      (namedFormula): namedFormula is FormulaLibraryNamedFormulaEntity =>
        namedFormula.type === 'named-formula' &&
        namedFormula.id !== item.id &&
        formulaUsesItemName(item.type, namedFormula.data.formula, item.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

// True when an older library item of the same kind has the same name (filter
// queries and AQL queries are one kind).
// Formulas then use the older one, so this item has no uses. The library list
// is oldest first.
export function isOverriddenLibraryItem(
  item: FormulaLibraryItemEntity,
  library: readonly FormulaLibraryItemEntity[],
) {
  for (const libraryItem of library) {
    if (libraryItem.id === item.id) return false;
    if (
      getLibraryNameKind(libraryItem.type) === getLibraryNameKind(item.type) &&
      isSameQueryName(libraryItem.name, item.name)
    ) {
      return true;
    }
  }
  return false;
}
