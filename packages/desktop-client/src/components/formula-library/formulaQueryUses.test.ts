import type {
  DashboardPageEntity,
  DashboardWidgetEntity,
  FormulaWidget,
} from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import { findFormulaQueryUses } from './formulaQueryUses';

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

    expect(findFormulaQueryUses('food', widgets, pages)).toEqual([
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

    expect(findFormulaQueryUses('food', widgets, pages)).toEqual([]);
  });
});
