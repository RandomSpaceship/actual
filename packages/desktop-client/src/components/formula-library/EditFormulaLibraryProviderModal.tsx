import React, { lazy, Suspense, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import {
  isReservedProviderName,
  isSameProviderName,
  isValidProviderName,
} from '@actual-app/core/shared/formulas/providerNameUses';
import type {
  AccountEntity,
  FormulaLibraryItemEntity,
  FormulaLibraryProviderEntity,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import { FormulaWarnings } from '#components/formula/FormulaWarnings';
import { resolveProviders } from '#components/formula/resolveProviders';
import { listQueryNames } from '#components/formula/resolveQuery';
import { FormulaResult } from '#components/reports/FormulaResult';
import {
  formulaLibraryQueries,
  useCreateFormulaLibraryItemMutation,
  useUpdateFormulaLibraryItemMutation,
} from '#formula-library';
import { useAccounts } from '#hooks/useAccounts';
import { useFormulaExecution } from '#hooks/useFormulaExecution';

import { FormulaQueryUsesList } from './FormulaQueryUsesList';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

const FormulaEditor = lazy(() =>
  import('#components/formula/FormulaEditor').then(module => ({
    default: module.FormulaEditor,
  })),
);

// Stable identities, so the preview does not run again on each render
const NO_CARD_QUERIES = {};
const NO_ACCOUNTS: AccountEntity[] = [];

type EditFormulaLibraryProviderModalProps = {
  // Without it, the modal creates a new provider
  item?: FormulaLibraryProviderEntity;
};

export function EditFormulaLibraryProviderModal({
  item,
}: EditFormulaLibraryProviderModalProps) {
  const { t } = useTranslation();
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const findUses = useFindFormulaQueryUses();
  const createItem = useCreateFormulaLibraryItemMutation();
  const updateItem = useUpdateFormulaLibraryItemMutation();
  const accounts = useAccounts().data ?? NO_ACCOUNTS;

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.data.description ?? '');
  const [formula, setFormula] = useState(item?.data.formula ?? '=');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  // Set when a rename needs the user to choose the cards to change
  const [renameWidgetIds, setRenameWidgetIds] = useState<Set<string> | null>(
    null,
  );

  const trimmedName = name.trim();
  const { cards: uses, providers: providerUses } = item
    ? findUses(item)
    : { cards: [], providers: [] };
  const isRename = item !== undefined && trimmedName !== item.name;

  const simpleAccounts = accounts
    .filter(account => !account.tombstone)
    .map(account => ({ id: account.id, name: account.name }));
  // A provider uses the queries of the card that uses it. The preview has no
  // card, so it uses library queries only.
  const preview = useFormulaExecution(
    formula,
    NO_CARD_QUERIES,
    undefined,
    undefined,
    simpleAccounts,
  );

  function validateName() {
    if (trimmedName === '') {
      return t('Enter a name');
    }
    if (isReservedProviderName(trimmedName)) {
      return t('Formulas use this name for something else');
    }
    if (!isValidProviderName(trimmedName)) {
      return t(
        'Use only letters, digits, _ and . in the name, with a letter or _ at the start. The name cannot look like a cell reference, for example AB12',
      );
    }
    if (
      library.some(
        libraryItem =>
          libraryItem.id !== item?.id &&
          libraryItem.type === 'provider' &&
          isSameProviderName(libraryItem.name, trimmedName),
      )
    ) {
      return t('A provider with this name already exists');
    }
    return null;
  }

  // The library as it is after the save, to find a cycle that the change makes
  function validateFormula() {
    if (!formula.trim().startsWith('=')) {
      return t('The formula must start with =');
    }
    const editedProvider: FormulaLibraryItemEntity = {
      id: item?.id ?? '',
      type: 'provider',
      name: trimmedName,
      data: { formula },
      created_at: item?.created_at ?? 0,
    };
    const editedLibrary = [
      ...(item ? [] : [editedProvider]),
      ...library.map(libraryItem =>
        libraryItem.id === item?.id ? editedProvider : libraryItem,
      ),
    ];
    const cycle = resolveProviders([formula], editedLibrary).issues.find(
      issue => issue.kind === 'provider-cycle',
    );
    return cycle ? cycle.message : null;
  }

  async function save(close: () => void, widgetIds: Set<string> = new Set()) {
    const data = {
      formula: formula.trim(),
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
      await createItem.mutateAsync({
        type: 'provider',
        name: trimmedName,
        data,
      });
    }
    close();
  }

  function onSave(close: () => void) {
    const newNameError = validateName();
    const newFormulaError = newNameError ? null : validateFormula();
    setNameError(newNameError);
    setFormulaError(newFormulaError);
    if (newNameError || newFormulaError) return;

    if (isRename && uses.length + providerUses.length > 0) {
      setRenameWidgetIds(new Set(uses.map(use => use.widgetId)));
      return;
    }

    void save(close);
  }

  return (
    <Modal name="edit-formula-library-provider">
      {({ state }) => (
        <View style={{ width: 800, maxWidth: '100%' }}>
          <ModalHeader
            title={item ? t('Edit provider') : t('New provider')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          {renameWidgetIds ? (
            <View style={{ lineHeight: 1.5 }}>
              <Paragraph>
                <Trans>
                  Choose the cards to change from "{{ oldName: item?.name }}" to
                  "{{ newName: trimmedName }}". A card that you do not choose
                  shows an error until you change it or add a provider with the
                  old name.
                </Trans>
              </Paragraph>
              {providerUses.length > 0 && (
                <Paragraph>
                  <Trans count={providerUses.length}>
                    {{ count: providerUses.length }} providers use this
                    provider. They change too.
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
                  <FormLabel
                    title={t('Name')}
                    htmlFor="formula-provider-name"
                  />
                  <Input
                    id="formula-provider-name"
                    value={name}
                    onChangeValue={setName}
                    style={{ fontFamily: 'monospace' }}
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
                    htmlFor="formula-provider-description"
                  />
                  <Input
                    id="formula-provider-description"
                    value={description}
                    onChangeValue={setDescription}
                  />
                </FormField>
              </View>
              <FormField style={{ marginBottom: 10 }}>
                <FormLabel title={t('Formula')} />
                <View
                  style={{
                    border: '1px solid ' + theme.formInputBorder,
                    borderRadius: 4,
                    minHeight: 120,
                  }}
                >
                  <Suspense
                    fallback={<div style={{ padding: 10 }}>Loading...</div>}
                  >
                    <FormulaEditor
                      value={formula}
                      onChange={setFormula}
                      mode="query"
                      queries={listQueryNames({ localQueries: {}, library })}
                      singleLine={false}
                      showLineNumbers
                    />
                  </Suspense>
                </View>
                {formulaError && (
                  <Text style={{ color: theme.errorText, marginTop: 5 }}>
                    {formulaError}
                  </Text>
                )}
              </FormField>
              <Text style={{ color: theme.pageTextSubdued, marginBottom: 5 }}>
                <Trans>Result:</Trans>
              </Text>
              <View
                style={{
                  height: 60,
                  backgroundColor: theme.cardBackground,
                  borderRadius: 6,
                  overflow: 'auto',
                }}
              >
                <FormulaResult
                  value={preview.result}
                  error={preview.error}
                  loading={preview.isLoading}
                  fontSizeMode="static"
                  staticFontSize={20}
                />
              </View>
              <FormulaWarnings issues={preview.issues} />
              <Text
                style={{
                  color: theme.pageTextSubdued,
                  fontSize: 12,
                  marginTop: 5,
                }}
              >
                <Trans>
                  The result uses library queries. On a card, a card query with
                  the same name wins, so the result can be different.
                </Trans>
              </Text>
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
