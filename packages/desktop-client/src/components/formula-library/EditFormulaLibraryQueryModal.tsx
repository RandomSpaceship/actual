import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import {
  isNamedQueryItem,
  isSameQueryName,
} from '@actual-app/core/shared/formulas/queryNameUses';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  FormulaLibraryQueryData,
  FormulaLibraryQueryEntity,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import { QueryItem } from '#components/formula/QueryManager';
import {
  formulaLibraryQueries,
  useCreateFormulaLibraryItemMutation,
  useUpdateFormulaLibraryItemMutation,
} from '#formula-library';

import { FormulaQueryUsesList } from './FormulaQueryUsesList';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

type EditFormulaLibraryQueryModalProps = {
  // Without it, the modal creates a new query
  item?: FormulaLibraryQueryEntity;
};

const NEW_QUERY_DATA: FormulaLibraryQueryData = {
  conditions: [],
  conditionsOp: 'and',
  timeFrame: {
    start: monthUtils.firstDayOfMonth(monthUtils.currentDay()),
    end: monthUtils.currentDay(),
    mode: 'sliding-window',
  },
};

export function EditFormulaLibraryQueryModal({
  item,
}: EditFormulaLibraryQueryModalProps) {
  const { t } = useTranslation();
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const findUses = useFindFormulaQueryUses();
  const createItem = useCreateFormulaLibraryItemMutation();
  const updateItem = useUpdateFormulaLibraryItemMutation();

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.data.description ?? '');
  const [config, setConfig] = useState<
    Omit<FormulaLibraryQueryData, 'description'>
  >(() => {
    const { conditions, conditionsOp, timeFrame } =
      item?.data ?? NEW_QUERY_DATA;
    return { conditions, conditionsOp, timeFrame };
  });
  const [nameError, setNameError] = useState<string | null>(null);
  // Set when a rename needs the user to choose the cards to change
  const [renameWidgetIds, setRenameWidgetIds] = useState<Set<string> | null>(
    null,
  );

  const trimmedName = name.trim();
  const { cards: uses, providers: providerUses } = item
    ? findUses(item)
    : { cards: [], providers: [] };
  const isRename = item !== undefined && trimmedName !== item.name;

  function validateName() {
    if (trimmedName === '') {
      return t('Enter a name');
    }
    if (
      library.some(
        libraryItem =>
          libraryItem.id !== item?.id &&
          isNamedQueryItem(libraryItem) &&
          isSameQueryName(libraryItem.name, trimmedName),
      )
    ) {
      return t('A library query with this name already exists');
    }
    return null;
  }

  async function save(close: () => void, widgetIds: Set<string> = new Set()) {
    const data = {
      ...config,
      ...(description.trim() !== '' && { description: description.trim() }),
    };

    if (item) {
      await updateItem.mutateAsync({
        id: item.id,
        name: trimmedName,
        data,
        renameInWidgetIds: [...widgetIds],
      });
    } else {
      await createItem.mutateAsync({ type: 'query', name: trimmedName, data });
    }
    close();
  }

  function onSave(close: () => void) {
    const error = validateName();
    setNameError(error);
    if (error) return;

    if (isRename && uses.length + providerUses.length > 0) {
      setRenameWidgetIds(new Set(uses.map(use => use.widgetId)));
      return;
    }

    void save(close);
  }

  return (
    <Modal name="edit-formula-library-query">
      {({ state }) => (
        <View style={{ width: 800, maxWidth: '100%' }}>
          <ModalHeader
            title={item ? t('Edit library query') : t('New library query')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          {renameWidgetIds ? (
            <View style={{ lineHeight: 1.5 }}>
              <Paragraph>
                <Trans>
                  Choose the cards to change from "{{ oldName: item?.name }}" to
                  "{{ newName: trimmedName }}". A card that you do not choose
                  shows an error until you change it or add a query with the old
                  name.
                </Trans>
              </Paragraph>
              {providerUses.length > 0 && (
                <Paragraph>
                  <Trans count={providerUses.length}>
                    {{ count: providerUses.length }} providers use the query.
                    They change too.
                  </Trans>
                </Paragraph>
              )}
              <FormulaQueryUsesList
                uses={uses}
                providers={providerUses}
                checkedWidgetIds={renameWidgetIds}
                onCheckedChange={(widgetId, checked) => {
                  const next = new Set(renameWidgetIds);
                  if (checked) {
                    next.add(widgetId);
                  } else {
                    next.delete(widgetId);
                  }
                  setRenameWidgetIds(next);
                }}
              />
              <ModalButtons style={{ marginTop: 20 }}>
                <Button
                  style={{ marginRight: 10 }}
                  onPress={() => setRenameWidgetIds(null)}
                >
                  <Trans>Back</Trans>
                </Button>
                <Button
                  variant="primary"
                  onPress={() =>
                    void save(() => state.close(), renameWidgetIds)
                  }
                >
                  <Trans>Rename</Trans>
                </Button>
              </ModalButtons>
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <FormField style={{ flex: 1 }}>
                  <FormLabel title={t('Name')} htmlFor="formula-query-name" />
                  <Input
                    id="formula-query-name"
                    value={name}
                    onChangeValue={setName}
                    autoFocus
                  />
                  {nameError && (
                    <Text style={{ color: theme.errorText, marginTop: 5 }}>
                      {nameError}
                    </Text>
                  )}
                </FormField>
                <FormField style={{ flex: 2 }}>
                  <FormLabel
                    title={t('Description')}
                    htmlFor="formula-query-description"
                  />
                  <Input
                    id="formula-query-description"
                    value={description}
                    onChangeValue={setDescription}
                  />
                </FormField>
              </View>
              <QueryItem
                queryName={trimmedName}
                defaultConfig={config}
                onUpdate={setConfig}
              />
              <ModalButtons>
                <Button
                  style={{ marginRight: 10 }}
                  onPress={() => state.close()}
                >
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  variant="primary"
                  onPress={() => onSave(() => state.close())}
                >
                  <Trans>Save</Trans>
                </Button>
              </ModalButtons>
            </View>
          )}
        </View>
      )}
    </Modal>
  );
}
