import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { runMutator } from '#server/mutators';
import { q } from '#shared/query';
import type {
  DashboardWidgetEntity,
  ExportImportDashboard,
  FormulaLibraryItemEntity,
  FormulaWidget,
} from '#types/models';

import { app as dashboardApp, isWidgetType } from './app';

function allWidgetTypes<T extends DashboardWidgetEntity['type'][]>(
  ...types: T &
    (DashboardWidgetEntity['type'] extends T[number] ? unknown : never)
): T {
  return types;
}

const ALL_WIDGET_TYPES = allWidgetTypes(
  'net-worth-card',
  'cash-flow-card',
  'spending-card',
  'crossover-card',
  'budget-analysis-card',
  'markdown-card',
  'summary-card',
  'calendar-card',
  'formula-card',
  'custom-report',
  'sankey-card',
  'balance-forecast-card',
  'age-of-money-card',
  'monte-carlo-card',
);

describe('isWidgetType', () => {
  it('all known widget types should be recognized', () => {
    for (const type of ALL_WIDGET_TYPES) {
      expect(isWidgetType(type)).toBe(true);
    }
  });

  it('unknown widget types should be rejected', () => {
    expect(isWidgetType('unknown-card')).toBe(false);
  });
});

describe('dashboard-update', () => {
  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();
  });

  async function addWidget(id: string, x: number) {
    await db.insertWithSchema('dashboard', {
      id,
      type: 'markdown-card',
      width: 4,
      height: 2,
      x,
      y: 0,
      dashboard_page_id: 'dashboard-page-id',
    });
  }

  // An empty database still carries the default dashboard the migrations
  // seed, so only look at the widgets the test added
  async function getTestWidgets(ids: string[]) {
    const { data } = await aqlQuery(
      q('dashboard')
        .filter({ id: { $oneof: ids } })
        .select('*'),
    );
    return (data as DashboardWidgetEntity[]).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  it('persists every widget in a layout change', async () => {
    await addWidget('widget-1', 0);
    await addWidget('widget-2', 4);
    await addWidget('widget-3', 8);

    await runMutator(() =>
      dashboardApp.handlers['dashboard-update']([
        { id: 'widget-1', x: 8, y: 2 },
        { id: 'widget-2', x: 0, y: 4 },
        { id: 'widget-3', x: 4, y: 6 },
      ]),
    );

    expect(
      (await getTestWidgets(['widget-1', 'widget-2', 'widget-3'])).map(
        ({ id, x, y }) => ({ id, x, y }),
      ),
    ).toEqual([
      { id: 'widget-1', x: 8, y: 2 },
      { id: 'widget-2', x: 0, y: 4 },
      { id: 'widget-3', x: 4, y: 6 },
    ]);
  });

  it('round-trips a meta object', async () => {
    await addWidget('widget-1', 0);

    await runMutator(() =>
      dashboardApp.handlers['dashboard-update']([
        { id: 'widget-1', meta: { content: '## Notes' } },
      ]),
    );

    expect((await getTestWidgets(['widget-1']))[0].meta).toEqual({
      content: '## Notes',
    });
  });
});

describe('dashboard-import', () => {
  let importDir: string;

  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();
    await db.insertWithSchema('dashboard_pages', {
      id: 'imported-page-id',
      name: 'Imported',
    });
    importDir = mkdtempSync(join(tmpdir(), 'dashboard-import-'));
  });

  afterEach(() => {
    rmSync(importDir, { recursive: true, force: true });
  });

  async function importFile(dashboard: ExportImportDashboard) {
    const filePath = join(importDir, 'dashboard.json');
    writeFileSync(filePath, JSON.stringify(dashboard));
    return runMutator(() =>
      dashboardApp.handlers['dashboard-import']({
        filePath,
        dashboardPageId: 'imported-page-id',
      }),
    );
  }

  async function getLibrary() {
    const { data } = await aqlQuery(q('formula_library').select('*'));
    return data as FormulaLibraryItemEntity[];
  }

  async function getImportedWidgets() {
    const { data } = await aqlQuery(
      q('dashboard')
        .filter({ dashboard_page_id: 'imported-page-id' })
        .select('*'),
    );
    return data as FormulaWidget[];
  }

  const january = {
    start: '2024-01-01',
    end: '2024-01-31',
    mode: 'static' as const,
  };
  const february = {
    start: '2024-02-01',
    end: '2024-02-29',
    mode: 'static' as const,
  };

  function formulaCard(formula: string, meta: FormulaWidget['meta'] = {}) {
    return {
      type: 'formula-card' as const,
      dashboard_page_id: 'exported-page-id',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      meta: { ...meta, formula },
    };
  }

  it('imports the library queries that the formula cards use', async () => {
    await db.insertWithSchema('formula_library', {
      id: 'local-food-id',
      type: 'query',
      name: 'Food',
      data: { timeFrame: february },
      created_at: 1,
    });

    await importFile({
      version: 1,
      widgets: [
        formulaCard('=QUERY("Rent")', {
          timeFrameOverrides: {
            'exported-rent-id': { name: 'Rent', timeFrame: february },
          },
        }),
        formulaCard('=QUERY("Food")'),
      ],
      formulaLibrary: [
        {
          id: 'exported-rent-id',
          type: 'query',
          name: 'Rent',
          data: { timeFrame: january },
        },
        {
          id: 'exported-food-id',
          type: 'query',
          name: 'Food',
          data: { timeFrame: january },
        },
      ],
    });

    const library = await getLibrary();
    const rent = library.find(({ name }) => name === 'Rent');
    expect(library.map(({ name }) => name).sort()).toEqual(['Food', 'Rent']);
    expect(rent?.id).not.toBe('exported-rent-id');
    expect(rent?.data).toEqual({ timeFrame: january });

    const widgets = await getImportedWidgets();
    const rentCard = widgets.find(({ meta }) =>
      meta?.formula?.includes('Rent'),
    );
    const foodCard = widgets.find(({ meta }) =>
      meta?.formula?.includes('Food'),
    );
    expect(rentCard?.meta?.timeFrameOverrides).toEqual({
      [rent?.id ?? '']: { name: 'Rent', timeFrame: february },
    });
    expect(foodCard?.meta?.queries).toEqual({
      Food: { conditions: [], conditionsOp: 'and', timeFrame: january },
    });
  });

  it('rejects a formula library item without a name', async () => {
    await expect(
      importFile({
        version: 1,
        widgets: [],
        formulaLibrary: [{ id: 'item-id', type: 'query', name: ' ', data: {} }],
      }),
    ).rejects.toThrow('formulaLibrary.0.name');
  });

  it('rejects a provider with a bad name or formula', async () => {
    await expect(
      importFile({
        version: 1,
        widgets: [],
        formulaLibrary: [
          {
            id: 'item-id',
            type: 'provider',
            name: 'A1',
            data: { formula: '=1' },
          },
        ],
      }),
    ).rejects.toThrow('formulaLibrary.0.name');
    await expect(
      importFile({
        version: 1,
        widgets: [],
        formulaLibrary: [
          {
            id: 'item-id',
            type: 'provider',
            name: 'Net',
            data: { formula: '1' },
          },
        ],
      }),
    ).rejects.toThrow('formulaLibrary.0.data.formula');
  });

  it('imports a provider with a new name when the library has a different one', async () => {
    await db.insertWithSchema('formula_library', {
      id: 'local-net-id',
      type: 'provider',
      name: 'Net',
      data: { formula: '=2' },
      created_at: 1,
    });

    await importFile({
      version: 1,
      widgets: [formulaCard('=Net * 3')],
      formulaLibrary: [
        {
          id: 'net-id',
          type: 'provider',
          name: 'Net',
          data: { formula: '=1' },
        },
      ],
    });

    expect((await getLibrary()).map(({ name, data }) => [name, data])).toEqual([
      ['Net', { formula: '=2' }],
      ['Net_2', { formula: '=1' }],
    ]);
    expect((await getImportedWidgets())[0].meta?.formula).toBe('=Net_2 * 3');
  });
});
