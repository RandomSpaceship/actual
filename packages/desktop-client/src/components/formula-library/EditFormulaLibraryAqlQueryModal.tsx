import React, { lazy, Suspense, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Paragraph } from '@actual-app/components/paragraph';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { parseAqlQuery } from '@actual-app/core/shared/formulas/aqlQuery';
import {
  isNamedQueryItem,
  isSameQueryName,
} from '@actual-app/core/shared/formulas/queryNameUses';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  FormulaLibraryAqlQueryData,
  FormulaLibraryAqlQueryEntity,
  TimeFrame,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { Link } from '#components/common/Link';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { Checkbox, FormField, FormLabel } from '#components/forms';
import {
  getAqlDateField,
  getAqlDateFields,
} from '#components/formula/aqlSource';
import { QueryTimeFrameControl } from '#components/formula/QueryTimeFrameControl';
import {
  formulaLibraryQueries,
  useCreateFormulaLibraryItemMutation,
  useUpdateFormulaLibraryItemMutation,
} from '#formula-library';

import { describeAqlQuery } from './aqlQueryKind';
import { AqlQueryPreview } from './AqlQueryPreview';
import { FormulaQueryUsesList } from './FormulaQueryUsesList';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

const AqlEditor = lazy(() =>
  import('#components/formula/AqlEditor').then(module => ({
    default: module.AqlEditor,
  })),
);

const NEW_AQL = `{
  "table": "transactions",
  "filter": {
    "amount": { "$lt": 0 }
  }
}`;

type EditFormulaLibraryAqlQueryModalProps = {
  // Without it, the modal creates a new AQL query
  item?: FormulaLibraryAqlQueryEntity;
};

export function EditFormulaLibraryAqlQueryModal({
  item,
}: EditFormulaLibraryAqlQueryModalProps) {
  const { t } = useTranslation();
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const findUses = useFindFormulaQueryUses();
  const createItem = useCreateFormulaLibraryItemMutation();
  const updateItem = useUpdateFormulaLibraryItemMutation();

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.data.description ?? '');
  const [aql, setAql] = useState(item?.data.aql ?? NEW_AQL);
  // undefined: the default of the table
  const [dateField, setDateField] = useState(item?.data.dateField);
  const [timeFrame, setTimeFrame] = useState(item?.data.timeFrame);
  const [isCount, setIsCount] = useState(item?.data.isCount ?? false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isAqlErrorShown, setIsAqlErrorShown] = useState(false);
  // Set when a rename needs the user to choose the cards to change
  const [renameWidgetIds, setRenameWidgetIds] = useState<Set<string> | null>(
    null,
  );

  const trimmedName = name.trim();
  const { cards: uses, providers: providerUses } = item
    ? findUses(item)
    : { cards: [], providers: [] };
  const isRename = item !== undefined && trimmedName !== item.name;
  const aqlDescription = describeAqlQuery(aql);
  const { query: parsedQuery } = parseAqlQuery(aql);
  const dateFields = parsedQuery ? getAqlDateFields(parsedQuery.table) : [];
  const shownDateField = getAqlDateField({ text: aql, dateField });
  // All time, until you choose a time frame
  const shownTimeFrame: TimeFrame = {
    start: monthUtils.firstDayOfMonth(monthUtils.currentDay()),
    end: monthUtils.currentDay(),
    mode: 'full',
    ...timeFrame,
  };
  const isCountShown =
    parsedQuery?.kind === 'value' && !parsedQuery.isCountCalculation;

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
    // The other fields stay as they are
    const data: FormulaLibraryAqlQueryData = {
      ...item?.data,
      aql,
      description: description.trim() === '' ? undefined : description.trim(),
      dateField,
      timeFrame,
      isCount: isCountShown && isCount ? true : undefined,
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
        type: 'aql-query',
        name: trimmedName,
        data,
      });
    }
    close();
  }

  function onSave(close: () => void) {
    const error = validateName();
    setNameError(error);
    setIsAqlErrorShown(true);
    if (error || aqlDescription.error !== undefined) return;

    if (isRename && uses.length + providerUses.length > 0) {
      setRenameWidgetIds(new Set(uses.map(use => use.widgetId)));
      return;
    }

    void save(close);
  }

  return (
    <Modal name="edit-formula-library-aql-query">
      {({ state }) => (
        <View style={{ width: 800, maxWidth: '100%' }}>
          <ModalHeader
            title={item ? t('Edit AQL query') : t('New AQL query')}
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
                  <FormLabel title={t('Name')} htmlFor="formula-aql-name" />
                  <Input
                    id="formula-aql-name"
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
                    htmlFor="formula-aql-description"
                  />
                  <Input
                    id="formula-aql-description"
                    value={description}
                    onChangeValue={setDescription}
                  />
                </FormField>
              </View>
              <FormField style={{ marginBottom: 10 }}>
                <FormLabel title={t('Query')} />
                <View
                  style={{
                    border: '1px solid ' + theme.formInputBorder,
                    borderRadius: 4,
                    minHeight: 160,
                  }}
                >
                  <Suspense
                    fallback={
                      <div style={{ padding: 10 }}>
                        <Trans>Loading...</Trans>
                      </div>
                    }
                  >
                    <AqlEditor value={aql} onChange={setAql} />
                  </Suspense>
                </View>
                {/* The error shows while you type, in red after Save */}
                <Text
                  style={{
                    color:
                      aqlDescription.error !== undefined && isAqlErrorShown
                        ? theme.errorText
                        : theme.pageTextSubdued,
                    marginTop: 5,
                  }}
                >
                  {aqlDescription.error ?? aqlDescription.label}
                </Text>
              </FormField>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                {dateFields.length > 0 && (
                  <FormField>
                    <FormLabel
                      title={t('Date field for the time frame')}
                      htmlFor="formula-aql-date-field"
                    />
                    <Select
                      id="formula-aql-date-field"
                      value={shownDateField ?? ''}
                      options={[
                        ['', t('None')],
                        ...dateFields.map((field): [string, string] => [
                          field,
                          field,
                        ]),
                      ]}
                      onChange={value =>
                        setDateField(value === '' ? null : value)
                      }
                    />
                  </FormField>
                )}
                {shownDateField !== null && dateFields.length > 0 && (
                  <FormField>
                    <FormLabel title={t('Time frame')} />
                    <QueryTimeFrameControl
                      timeFrame={shownTimeFrame}
                      onChange={setTimeFrame}
                    />
                  </FormField>
                )}
                {isCountShown && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingBottom: 6,
                    }}
                  >
                    <Checkbox
                      id="formula-aql-is-count"
                      checked={isCount}
                      onChange={() => setIsCount(!isCount)}
                    />
                    <label htmlFor="formula-aql-is-count">
                      <Trans>The value is a count, not an amount</Trans>
                    </label>
                  </View>
                )}
              </View>
              <FormField style={{ marginBottom: 10 }}>
                <FormLabel title={t('Result')} />
                <AqlQueryPreview
                  aql={{
                    text: aql,
                    dateField,
                    isCount: isCountShown && isCount,
                  }}
                  timeFrame={shownDateField === null ? undefined : timeFrame}
                />
              </FormField>
              <Text
                style={{
                  color: theme.pageTextSubdued,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <Trans>
                  JSON with one key for each method of an{' '}
                  <Link
                    variant="external"
                    to="https://actualbudget.org/docs/api/actual-ql/"
                    linkColor="purple"
                  >
                    ActualQL
                  </Link>{' '}
                  query: table, filter, options, groupBy, select, orderBy,
                  calculate, limit and offset. A transactions query with only a
                  filter works as a filter query. A query with calculate gives
                  one value.
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
