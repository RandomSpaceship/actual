import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { getNormalisedString } from '@actual-app/core/shared/normalisation';
import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { Search } from '#components/common/Search';
import { Cell, TableHeader } from '#components/table';
import { formulaLibraryQueries } from '#formula-library';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { FormulaLibraryRow } from './FormulaLibraryRow';
import { isOverriddenLibraryQuery } from './formulaQueryUses';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

export function FormulaLibraryPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [filter, setFilter] = useState('');
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const findUses = useFindFormulaQueryUses();
  const formulaMode = useFeatureFlag('formulaMode');

  const queries = library.filter(item => item.type === 'query');

  const normalisedFilter = getNormalisedString(filter);
  const filteredQueries = queries
    .filter(
      item =>
        normalisedFilter === '' ||
        getNormalisedString(item.name).includes(normalisedFilter) ||
        getNormalisedString(item.data.description ?? '').includes(
          normalisedFilter,
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  function onEdit(item?: FormulaLibraryQueryEntity) {
    dispatch(
      pushModal({
        modal: { name: 'edit-formula-library-query', options: { item } },
      }),
    );
  }

  function onDelete(item: FormulaLibraryQueryEntity) {
    dispatch(
      pushModal({
        modal: {
          name: 'confirm-formula-library-query-delete',
          options: { item },
        },
      }),
    );
  }

  if (!formulaMode) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 0 15px',
          flexShrink: 0,
          gap: 10,
        }}
      >
        <Text style={{ color: theme.pageTextLight, flex: 1 }}>
          <Trans>
            Queries that every formula card can use, for example
            QUERY("groceries"). A query on a card wins over a library query with
            the same name.
          </Trans>
        </Text>
        <Search
          placeholder={t('Filter queries...')}
          value={filter}
          onChange={setFilter}
        />
      </View>
      <View style={styles.tableContainer}>
        <TableHeader>
          <Cell value={t('Name')} width={200} />
          <Cell value={t('Description')} width="flex" />
          <Cell value={t('Filters')} width="flex" />
          <Cell value={t('Time frame')} width={180} />
          <Cell value={t('Used by')} width={100} />
          <Cell value="" width={40} />
        </TableHeader>
        {filteredQueries.length === 0 ? (
          <View
            style={{
              background: theme.tableBackground,
              fontStyle: 'italic',
            }}
          >
            <Text style={{ margin: 'auto', padding: '20px' }}>
              {queries.length === 0 ? (
                <Trans>No library queries</Trans>
              ) : (
                <Trans>No queries match the filter</Trans>
              )}
            </Text>
          </View>
        ) : (
          filteredQueries.map(item => (
            <FormulaLibraryRow
              key={item.id}
              item={item}
              uses={findUses(item)}
              isOverridden={isOverriddenLibraryQuery(item, library)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </View>
      <View
        style={{
          paddingBlock: 15,
          flexDirection: 'row',
          justifyContent: 'flex-end',
        }}
      >
        <Button variant="primary" onPress={() => onEdit()}>
          <Trans>Create new query</Trans>
        </Button>
      </View>
    </View>
  );
}
