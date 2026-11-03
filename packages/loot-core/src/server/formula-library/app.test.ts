import { v4 as uuidv4 } from 'uuid';

import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { app } from '#server/formula-library/app';
import { q } from '#shared/query';
import type { FormulaLibraryItemEntity, FormulaWidget } from '#types/models';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
});

const foodData = {
  conditions: [],
  conditionsOp: 'and' as const,
  timeFrame: {
    start: '2024-01-01',
    end: '2024-01-31',
    mode: 'static' as const,
  },
};

async function getItems() {
  const { data } = await aqlQuery(q('formula_library').select('*'));
  return data as FormulaLibraryItemEntity[];
}

async function getWidget(id: string) {
  const { data } = await aqlQuery(q('dashboard').filter({ id }).select('*'));
  return (data as FormulaWidget[])[0];
}

async function addFormulaWidget(meta: FormulaWidget['meta']) {
  const id = uuidv4();
  await db.insertWithSchema('dashboard', {
    id,
    type: 'formula-card',
    width: 4,
    height: 2,
    x: 0,
    y: 0,
    meta,
    dashboard_page_id: 'page',
  });
  return id;
}

describe('formula library app', () => {
  it('creates items oldest first, with their data', async () => {
    const foodId = await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: foodData,
    });
    const rentId = await app.handlers['formula-library-create']({
      type: 'query',
      name: 'rent',
      data: {},
    });

    const items = await getItems();
    expect(items.map(item => item.id)).toEqual([foodId, rentId]);
    expect(items[0]).toMatchObject({
      type: 'query',
      name: 'food',
      data: foodData,
    });
    expect(items[0].created_at).toBeLessThanOrEqual(items[1].created_at);
  });

  it('rejects an empty name and a name in use, ignoring case', async () => {
    await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: {},
    });

    await expect(
      app.handlers['formula-library-create']({
        type: 'query',
        name: ' ',
        data: {},
      }),
    ).rejects.toThrow(/must have a name/);
    await expect(
      app.handlers['formula-library-create']({
        type: 'query',
        name: 'FOOD',
        data: {},
      }),
    ).rejects.toThrow(/already in use/);
  });

  it('allows the name of a deleted item', async () => {
    const id = await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: {},
    });
    await app.handlers['formula-library-delete']({ id });
    await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: {},
    });

    expect((await getItems()).map(item => item.name)).toEqual(['food']);
  });

  it('updates the data without a rename', async () => {
    const id = await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: {},
    });
    await app.handlers['formula-library-update']({ id, data: foodData });

    expect((await getItems())[0]).toMatchObject({
      name: 'food',
      data: foodData,
    });
  });

  it('renames the query in the cards it is given', async () => {
    const id = await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: {},
    });
    const renamedId = await addFormulaWidget({
      formula: '=QUERY("food") + QUERY("rent")',
      colorFormula: '=IF(QUERY("Food") > 0, "red", "")',
    });
    const notCheckedId = await addFormulaWidget({ formula: '=QUERY("food")' });
    const shadowedId = await addFormulaWidget({
      formula: '=QUERY("food")',
      queries: { food: {} },
    });

    await app.handlers['formula-library-update']({
      id,
      name: 'groceries',
      renameInWidgetIds: [renamedId, shadowedId],
    });

    expect((await getItems())[0].name).toBe('groceries');
    expect((await getWidget(renamedId)).meta).toMatchObject({
      formula: '=QUERY("groceries") + QUERY("rent")',
      colorFormula: '=IF(QUERY("groceries") > 0, "red", "")',
    });
    expect((await getWidget(notCheckedId)).meta?.formula).toBe(
      '=QUERY("food")',
    );
    expect((await getWidget(shadowedId)).meta?.formula).toBe('=QUERY("food")');
  });

  it('rejects a rename to a name in use', async () => {
    await app.handlers['formula-library-create']({
      type: 'query',
      name: 'food',
      data: {},
    });
    const id = await app.handlers['formula-library-create']({
      type: 'query',
      name: 'rent',
      data: {},
    });

    await expect(
      app.handlers['formula-library-update']({ id, name: 'Food' }),
    ).rejects.toThrow(/already in use/);
  });
});
