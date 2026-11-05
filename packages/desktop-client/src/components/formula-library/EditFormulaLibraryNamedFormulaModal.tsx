import React, { lazy, Suspense, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import {
  isReservedNamedFormulaName,
  isSameNamedFormulaName,
  isValidNamedFormulaName,
} from '@actual-app/core/shared/formulas/namedFormulaNameUses';
import type {
  AccountEntity,
  FormulaLibraryItemEntity,
  FormulaLibraryNamedFormulaData,
  FormulaLibraryNamedFormulaEntity,
  FormulaTimeFrameOverride,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import { FormulaTable } from '#components/formula/FormulaTable';
import { FormulaWarnings } from '#components/formula/FormulaWarnings';
import {
  listNamedFormulaNames,
  resolveNamedFormulas,
} from '#components/formula/resolveNamedFormulas';
import type { CardNamedFormulas } from '#components/formula/resolveNamedFormulas';
import { listQueryNames } from '#components/formula/resolveQuery';
import type { FormulaQueryConfig } from '#components/formula/resolveQuery';
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
const NO_CARD_NAMED_FORMULAS: CardNamedFormulas = {};
const NO_ACCOUNTS: AccountEntity[] = [];

// A named formula of one card. The card editor keeps it until the card is saved.
export type CardNamedFormulaEditContext = {
  // Without it, the modal creates a new card named formula
  name?: string;
  namedFormulas: CardNamedFormulas;
  queries: Record<string, FormulaQueryConfig>;
  // Keyed by library item id
  timeFrameOverrides: Record<string, FormulaTimeFrameOverride>;
  onSave: (name: string, data: FormulaLibraryNamedFormulaData) => void;
};

type EditFormulaLibraryNamedFormulaModalProps = {
  // Without it, the modal creates a new named formula
  item?: FormulaLibraryNamedFormulaEntity;
  // Set to edit a card named formula in place of a library named formula
  card?: CardNamedFormulaEditContext;
};

export function EditFormulaLibraryNamedFormulaModal({
  item,
  card,
}: EditFormulaLibraryNamedFormulaModalProps) {
  const { t } = useTranslation();
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const findUses = useFindFormulaQueryUses();
  const createItem = useCreateFormulaLibraryItemMutation();
  const updateItem = useUpdateFormulaLibraryItemMutation();
  const accounts = useAccounts().data ?? NO_ACCOUNTS;

  const cardNamedFormula =
    card?.name !== undefined ? card.namedFormulas[card.name] : undefined;
  const [name, setName] = useState(item?.name ?? card?.name ?? '');
  const [description, setDescription] = useState(
    item?.data.description ?? cardNamedFormula?.description ?? '',
  );
  const [formula, setFormula] = useState(
    item?.data.formula ?? cardNamedFormula?.formula ?? '=',
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  // Set when a rename needs the user to choose the cards to change
  const [renameWidgetIds, setRenameWidgetIds] = useState<Set<string> | null>(
    null,
  );

  const trimmedName = name.trim();
  const { cards: uses, namedFormulas: namedFormulaUses } = item
    ? findUses(item)
    : { cards: [], namedFormulas: [] };
  const isRename = item !== undefined && trimmedName !== item.name;

  // The other named formulas of the card
  const otherCardNamedFormulas = Object.fromEntries(
    Object.entries(card?.namedFormulas ?? NO_CARD_NAMED_FORMULAS).filter(
      ([namedFormulaName]) => namedFormulaName !== card?.name,
    ),
  );
  // The card named formulas as they are after the save
  const editedCardNamedFormulas: CardNamedFormulas = card
    ? { ...otherCardNamedFormulas, [trimmedName]: { formula } }
    : NO_CARD_NAMED_FORMULAS;
  const isLibraryNameHidden =
    card !== undefined &&
    library.some(
      libraryItem =>
        libraryItem.type === 'named-formula' &&
        isSameNamedFormulaName(libraryItem.name, trimmedName),
    );

  const simpleAccounts = accounts
    .filter(account => !account.tombstone)
    .map(account => ({ id: account.id, name: account.name }));
  // A named formula uses the queries of the card that uses it. A library named formula
  // has no card here, so its preview uses library queries only.
  // The inputs of the last run. As in the card editor, they follow your changes
  // until a run gives a large table. Then only Run and Ctrl+Enter update them.
  const [ranInputs, setRanInputs] = useState(() => ({
    formula,
    namedFormulas: editedCardNamedFormulas,
  }));
  function runFormula() {
    setRanInputs({ formula, namedFormulas: editedCardNamedFormulas });
  }
  const isChanged =
    formula !== ranInputs.formula ||
    JSON.stringify(editedCardNamedFormulas) !==
      JSON.stringify(ranInputs.namedFormulas);
  const preview = useFormulaExecution(
    ranInputs.formula,
    card?.queries ?? NO_CARD_QUERIES,
    undefined,
    undefined,
    simpleAccounts,
    card?.timeFrameOverrides,
    'auto',
    ranInputs.namedFormulas,
  );
  const isManualRun = preview.issues.some(
    issue => issue.kind === 'large-table' || issue.kind === 'table-cut',
  );
  if (!isManualRun && isChanged) {
    // A state update in render, as React allows for state that follows other
    // state. React renders again before it shows the page.
    runFormula();
  }

  function validateName() {
    if (trimmedName === '') {
      return t('Enter a name');
    }
    if (isReservedNamedFormulaName(trimmedName)) {
      return t('Formulas use this name for something else');
    }
    if (!isValidNamedFormulaName(trimmedName)) {
      return t(
        'Use only letters, digits, _ and . in the name, with a letter or _ at the start. The name cannot look like a cell reference, for example AB12',
      );
    }
    if (
      card
        ? Object.keys(otherCardNamedFormulas).some(namedFormulaName =>
            isSameNamedFormulaName(namedFormulaName, trimmedName),
          )
        : library.some(
            libraryItem =>
              libraryItem.id !== item?.id &&
              libraryItem.type === 'named-formula' &&
              isSameNamedFormulaName(libraryItem.name, trimmedName),
          )
    ) {
      return t('A named formula with this name already exists');
    }
    return null;
  }

  // The library as it is after the save, to find a cycle that the change makes
  function validateFormula() {
    if (!formula.trim().startsWith('=')) {
      return t('The formula must start with =');
    }
    const editedNamedFormula: FormulaLibraryItemEntity = {
      id: item?.id ?? '',
      type: 'named-formula',
      name: trimmedName,
      data: { formula },
      created_at: item?.created_at ?? 0,
    };
    const editedLibrary = [
      ...(item ? [] : [editedNamedFormula]),
      ...library.map(libraryItem =>
        libraryItem.id === item?.id ? editedNamedFormula : libraryItem,
      ),
    ];
    const cycle = resolveNamedFormulas(
      [formula],
      card ? library : editedLibrary,
      [],
      editedCardNamedFormulas,
    ).issues.find(issue => issue.kind === 'named-formula-cycle');
    return cycle ? cycle.message : null;
  }

  async function save(close: () => void, widgetIds: Set<string> = new Set()) {
    const data = {
      formula: formula.trim(),
      ...(description.trim() !== '' && { description: description.trim() }),
    };

    if (card) {
      card.onSave(trimmedName, data);
    } else if (item) {
      await updateItem.mutateAsync({
        id: item.id,
        name: trimmedName,
        data,
        renameInWidgetIds: [...widgetIds],
      });
    } else {
      await createItem.mutateAsync({
        type: 'named-formula',
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

    if (isRename && uses.length + namedFormulaUses.length > 0) {
      setRenameWidgetIds(new Set(uses.map(use => use.widgetId)));
      return;
    }

    void save(close);
  }

  return (
    <Modal name="edit-formula-library-named-formula">
      {({ state }) => (
        <View style={{ width: 800, maxWidth: '100%' }}>
          <ModalHeader
            title={
              card
                ? card.name !== undefined
                  ? t('Edit card named formula')
                  : t('New card named formula')
                : item
                  ? t('Edit named formula')
                  : t('New named formula')
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          {renameWidgetIds ? (
            <View style={{ lineHeight: 1.5 }}>
              <Paragraph>
                <Trans>
                  Choose the cards to change from "{{ oldName: item?.name }}" to
                  "{{ newName: trimmedName }}". A card that you do not choose
                  shows an error until you change it or add a named formula with
                  the old name.
                </Trans>
              </Paragraph>
              {namedFormulaUses.length > 0 && (
                <Paragraph>
                  <Trans count={namedFormulaUses.length}>
                    {{ count: namedFormulaUses.length }} named formulas use this
                    named formula. They change too.
                  </Trans>
                </Paragraph>
              )}
              <FormulaQueryUsesList
                uses={uses}
                namedFormulas={namedFormulaUses}
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
                    htmlFor="formula-named-formula-name"
                  />
                  <Input
                    id="formula-named-formula-name"
                    value={name}
                    onChangeValue={setName}
                    style={{ fontFamily: 'monospace' }}
                    autoFocus
                  />
                  {nameError ? (
                    <Text style={{ color: theme.errorText, marginTop: 5 }}>
                      {nameError}
                    </Text>
                  ) : (
                    isLibraryNameHidden && (
                      <Text style={{ color: theme.warningText, marginTop: 5 }}>
                        <Trans>
                          Hides the library named formula with the same name
                        </Trans>
                      </Text>
                    )
                  )}
                </FormField>
                <FormField style={{ flex: 2 }}>
                  <FormLabel
                    title={t('Description')}
                    htmlFor="formula-named-formula-description"
                  />
                  <Input
                    id="formula-named-formula-description"
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
                      queries={listQueryNames({
                        localQueries: card?.queries ?? {},
                        library,
                      })}
                      namedFormulas={listNamedFormulaNames(
                        library.filter(
                          libraryItem => libraryItem.id !== item?.id,
                        ),
                        otherCardNamedFormulas,
                      )}
                      singleLine={false}
                      showLineNumbers
                      onRun={runFormula}
                    />
                  </Suspense>
                </View>
                {formulaError && (
                  <Text style={{ color: theme.errorText, marginTop: 5 }}>
                    {formulaError}
                  </Text>
                )}
              </FormField>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 5,
                }}
              >
                <Text style={{ color: theme.pageTextSubdued }}>
                  <Trans>Result:</Trans>
                </Text>
                <View style={{ flex: 1 }} />
                {isManualRun && (
                  <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
                    {isChanged ? (
                      <Trans>
                        Changed. The table is large, so it updates only when you
                        select Run or press Ctrl+Enter.
                      </Trans>
                    ) : (
                      <Trans>
                        The table is large, so it updates only when you select
                        Run or press Ctrl+Enter.
                      </Trans>
                    )}
                  </Text>
                )}
                {isManualRun && (
                  <Button
                    variant={isChanged ? 'primary' : 'normal'}
                    onPress={runFormula}
                  >
                    <Trans>Run</Trans>
                  </Button>
                )}
              </View>
              {/* An error can be long, so it shows as text from its start */}
              {preview.error && !preview.isLoading ? (
                <Text
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    padding: 10,
                    backgroundColor: theme.cardBackground,
                    borderRadius: 6,
                    color: theme.errorText,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {preview.error}
                </Text>
              ) : preview.table ? (
                <FormulaTable
                  table={preview.table}
                  compact
                  style={{
                    maxHeight: 200,
                    backgroundColor: theme.cardBackground,
                    borderRadius: 6,
                  }}
                />
              ) : (
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
                    loading={preview.isLoading}
                    fontSizeMode="static"
                    staticFontSize={20}
                  />
                </View>
              )}
              <FormulaWarnings issues={preview.issues} />
              <Text
                style={{
                  color: theme.pageTextSubdued,
                  fontSize: 12,
                  marginTop: 5,
                }}
              >
                {card ? (
                  <Trans>The result uses the queries of this card.</Trans>
                ) : (
                  <Trans>
                    The result uses library queries. On a card, a card query
                    with the same name wins, so the result can be different.
                  </Trans>
                )}
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
