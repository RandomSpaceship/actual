import type {
  DashboardPageEntity,
  DashboardWidgetEntity,
  FormulaLibraryItemEntity,
  FormulaWidget,
} from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import {
  findFormulaQueryUses,
  findNamedFormulaUses,
  isOverriddenLibraryItem,
} from './formulaQueryUses';

const food = { type: 'query' as const, name: 'food' };

const pages: DashboardPageEntity[] = [
  { id: 'main', name: 'Main', tombstone: false },
  { id: 'bills', name: 'Bills', tombstone: false },
];

function formulaWidget(
  id: string,
  dashboardPageId: string,
  meta: FormulaWidget['meta'],
): FormulaWidget {
  return {
    id,
    dashboard_page_id: dashboardPageId,
    type: 'formula-card',
    x: 0,
    y: 0,
    width: 4,
    height: 2,
    meta,
    tombstone: false,
  };
}

describe('findFormulaQueryUses', () => {
  it('lists the cards that use a name, by dashboard and card name', () => {
    const widgets: DashboardWidgetEntity[] = [
      formulaWidget('total', 'main', {
        name: 'Total',
        formula: '=QUERY("Food")',
        colorFormula: '=IF(QUERY("food") > 0, "red", "")',
      }),
      formulaWidget('unnamed', 'main', { formula: '=QUERY("food")' }),
      formulaWidget('bills', 'bills', {
        name: 'Bills',
        formula: '=QUERY_COUNT("food")',
        colorFormula: '',
      }),
      formulaWidget('other', 'main', { formula: '=QUERY("rent")' }),
    ];

    expect(findFormulaQueryUses(food, widgets, pages)).toEqual([
      {
        widgetId: 'bills',
        cardName: 'Bills',
        dashboardName: 'Bills',
        formulas: ['=QUERY_COUNT("food")'],
      },
      {
        widgetId: 'unnamed',
        cardName: '',
        dashboardName: 'Main',
        formulas: ['=QUERY("food")'],
      },
      {
        widgetId: 'total',
        cardName: 'Total',
        dashboardName: 'Main',
        formulas: ['=QUERY("Food")', '=IF(QUERY("food") > 0, "red", "")'],
      },
    ]);
  });

  it('skips a card with a local query of the same name', () => {
    const widgets = [
      formulaWidget('local', 'main', {
        formula: '=QUERY("food")',
        queries: { FOOD: {} },
      }),
    ];

    expect(findFormulaQueryUses(food, widgets, pages)).toEqual([]);
  });

  it('finds an AQL query as a query, and skips a card query of its name', () => {
    const aqlFood = { type: 'aql-query' as const, name: 'food' };
    const widgets = [
      formulaWidget('library', 'main', { formula: '=QUERY("food")' }),
      formulaWidget('local', 'main', {
        formula: '=QUERY("food")',
        queries: { food: {} },
      }),
      formulaWidget('named-formula', 'main', { formula: '=food' }),
    ];

    expect(
      findFormulaQueryUses(aqlFood, widgets, pages).map(use => use.widgetId),
    ).toEqual(['library']);
  });
});

describe('isOverriddenLibraryItem', () => {
  it('treats filter queries and AQL queries as one set of names', () => {
    const library: FormulaLibraryItemEntity[] = [
      { id: 'old', type: 'query', name: 'Food', data: {}, created_at: 1 },
      {
        id: 'new',
        type: 'aql-query',
        name: 'food',
        data: { aql: '{"table": "transactions"}' },
        created_at: 2,
      },
      {
        id: 'named-formula',
        type: 'named-formula',
        name: 'food',
        data: { formula: '=1' },
        created_at: 3,
      },
    ];

    expect(isOverriddenLibraryItem(library[1], library)).toBe(true);
    expect(isOverriddenLibraryItem(library[0], library)).toBe(false);
    expect(isOverriddenLibraryItem(library[2], library)).toBe(false);
  });
});

describe('findFormulaQueryUses for a named formula', () => {
  it('lists the cards that use the name without quotes', () => {
    const widgets = [
      formulaWidget('uses', 'main', {
        formula: '=Net * 2',
        // A card query does not hide a named formula
        queries: { Net: {} },
      }),
      formulaWidget('text', 'main', { formula: '="Net" & QUERY("Net")' }),
    ];

    expect(
      findFormulaQueryUses(
        { type: 'named-formula', name: 'net' },
        widgets,
        pages,
      ).map(({ widgetId }) => widgetId),
    ).toEqual(['uses']);
  });

  it('finds uses in card named formulas, and skips a card named formula of the same name', () => {
    const widgets = [
      formulaWidget('card', 'main', {
        formula: '=Yearly',
        namedFormulas: { Yearly: { formula: '=Net * 12' } },
      }),
      formulaWidget('hidden', 'main', {
        formula: '=Net',
        namedFormulas: { NET: { formula: '=1' } },
      }),
    ];

    expect(
      findFormulaQueryUses(
        { type: 'named-formula', name: 'Net' },
        widgets,
        pages,
      ),
    ).toEqual([
      expect.objectContaining({
        widgetId: 'card',
        formulas: ['=Net * 12'],
      }),
    ]);
  });
});

describe('findNamedFormulaUses', () => {
  function namedFormula(
    name: string,
    formula: string,
  ): FormulaLibraryItemEntity {
    return {
      id: name,
      type: 'named-formula',
      name,
      data: { formula },
      created_at: 0,
    };
  }

  it('lists the other named formulas that use a query or named formula', () => {
    const library = [
      namedFormula('Yearly', '=Net * 12'),
      namedFormula('Net', '=QUERY("food") - Net'),
      namedFormula('Other', '=QUERY("rent")'),
    ];

    expect(
      findNamedFormulaUses(
        { id: 'Net', type: 'named-formula', name: 'net' },
        library,
      ).map(({ name }) => name),
    ).toEqual(['Yearly']);
    expect(
      findNamedFormulaUses({ id: 'q', ...food }, library).map(
        ({ name }) => name,
      ),
    ).toEqual(['Net']);
  });
});
