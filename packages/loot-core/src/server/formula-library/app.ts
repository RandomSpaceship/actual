import { v4 as uuidv4 } from 'uuid';

import { createApp } from '#server/app';
import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { ValidationError } from '#server/errors';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import { undoable } from '#server/undo';
import { isValidProviderName } from '#shared/formulas/providerNameUses';
import {
  isSameQueryName,
  renameQueryInFormula,
} from '#shared/formulas/queryNameUses';
import { q } from '#shared/query';
import type { FormulaLibraryItemEntity, FormulaWidget } from '#types/models';

export type FormulaLibraryHandlers = {
  'formula-library-create': typeof createItem;
  'formula-library-update': typeof updateItem;
  'formula-library-delete': typeof deleteItem;
};

export const app = createApp<FormulaLibraryHandlers>();
app.method('formula-library-create', mutator(undoable(createItem)));
app.method('formula-library-update', mutator(undoable(updateItem)));
app.method('formula-library-delete', mutator(undoable(deleteItem)));

async function getItems(): Promise<FormulaLibraryItemEntity[]> {
  const { data } = await aqlQuery(q('formula_library').select('*'));
  return data as FormulaLibraryItemEntity[];
}

// Duplicate names can still come from sync. Then the oldest item wins
async function validateName(
  type: FormulaLibraryItemEntity['type'],
  name: string,
  id?: FormulaLibraryItemEntity['id'],
) {
  if (name.trim() === '') {
    throw new ValidationError('A formula library item must have a name');
  }
  if (type === 'provider' && !isValidProviderName(name)) {
    throw new ValidationError(`"${name}" cannot be a provider name`);
  }

  const items = await getItems();
  if (
    items.some(
      item =>
        item.id !== id &&
        item.type === type &&
        isSameQueryName(item.name, name),
    )
  ) {
    throw new ValidationError(`The name "${name}" is already in use`);
  }
}

async function createItem({
  type,
  name,
  data,
}: Pick<FormulaLibraryItemEntity, 'type' | 'name' | 'data'>): Promise<
  FormulaLibraryItemEntity['id']
> {
  await validateName(type, name);

  const id = uuidv4();
  await db.insertWithSchema('formula_library', {
    id,
    type,
    name,
    data,
    created_at: Date.now(),
  });
  return id;
}

// A rename changes the formula text of the cards in renameInWidgetIds, in the
// same batch, so that one undo reverts all of it. A card with a local query
// that has the old name does not use the library item, so it does not change.
async function updateItem({
  id,
  name,
  data,
  renameInWidgetIds = [],
}: Pick<FormulaLibraryItemEntity, 'id'> &
  Partial<Pick<FormulaLibraryItemEntity, 'name' | 'data'>> & {
    renameInWidgetIds?: string[];
  }): Promise<void> {
  const item = (await getItems()).find(candidate => candidate.id === id);
  if (!item) {
    throw new ValidationError(`Formula library item ${id} not found`);
  }

  const isRename = name !== undefined && name !== item.name;
  if (isRename) {
    await validateName(item.type, name, id);
  }

  const widgets =
    isRename && renameInWidgetIds.length > 0
      ? ((
          await aqlQuery(
            q('dashboard')
              .filter({
                type: 'formula-card',
                id: { $oneof: renameInWidgetIds },
              })
              .select('*'),
          )
        ).data as FormulaWidget[])
      : [];

  await batchMessages(async () => {
    await db.updateWithSchema('formula_library', {
      id,
      ...(name !== undefined && { name }),
      ...(data !== undefined && { data }),
    });

    if (!isRename) return;

    for (const widget of widgets) {
      const meta = widget.meta;
      const localQueryNames = Object.keys(meta?.queries ?? {});
      if (
        !meta ||
        localQueryNames.some(localName => isSameQueryName(localName, item.name))
      ) {
        continue;
      }

      const rename = (formula: string | undefined) =>
        formula === undefined
          ? undefined
          : renameQueryInFormula(formula, item.name, name);

      await db.updateWithSchema('dashboard', {
        id: widget.id,
        meta: {
          ...meta,
          formula: rename(meta.formula),
          colorFormula: rename(meta.colorFormula),
        },
      });
    }
  });
}

async function deleteItem({
  id,
}: Pick<FormulaLibraryItemEntity, 'id'>): Promise<void> {
  await db.delete_('formula_library', id);
}
