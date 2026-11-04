import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { getNormalisedString } from '@actual-app/core/shared/normalisation';
import type {
  FormulaLibraryAqlQueryEntity,
  FormulaLibraryItemEntity,
  FormulaLibraryProviderEntity,
  FormulaLibraryQueryEntity,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { Search } from '#components/common/Search';
import { Cell, TableHeader } from '#components/table';
import { formulaLibraryQueries } from '#formula-library';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { FormulaLibraryAqlQueryRow } from './FormulaLibraryAqlQueryRow';
import { FormulaLibraryProviderRow } from './FormulaLibraryProviderRow';
import { FormulaLibraryRow } from './FormulaLibraryRow';
import { isOverriddenLibraryItem } from './formulaQueryUses';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

export function FormulaLibraryPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [filter, setFilter] = useState('');
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const findUses = useFindFormulaQueryUses();
  const formulaMode = useFeatureFlag('formulaMode');

  const normalisedFilter = getNormalisedString(filter);
  function filterAndSort<Item extends FormulaLibraryItemEntity>(
    items: Item[],
    getFilterText: (item: Item) => string[],
  ) {
    return items
      .filter(
        item =>
          normalisedFilter === '' ||
          [item.name, item.data.description ?? '', ...getFilterText(item)].some(
            text => getNormalisedString(text).includes(normalisedFilter),
          ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const queries = library.filter(
    (item): item is FormulaLibraryQueryEntity => item.type === 'query',
  );
  const aqlQueries = library.filter(
    (item): item is FormulaLibraryAqlQueryEntity => item.type === 'aql-query',
  );
  const providers = library.filter(
    (item): item is FormulaLibraryProviderEntity => item.type === 'provider',
  );
  const filteredQueries = filterAndSort(queries, () => []);
  const filteredAqlQueries = filterAndSort(aqlQueries, item => [item.data.aql]);
  const filteredProviders = filterAndSort(providers, item => [
    item.data.formula,
  ]);

  function onEditQuery(item?: FormulaLibraryQueryEntity) {
    dispatch(
      pushModal({
        modal: { name: 'edit-formula-library-query', options: { item } },
      }),
    );
  }

  function onEditAqlQuery(item?: FormulaLibraryAqlQueryEntity) {
    dispatch(
      pushModal({
        modal: { name: 'edit-formula-library-aql-query', options: { item } },
      }),
    );
  }

  function onEditProvider(item?: FormulaLibraryProviderEntity) {
    dispatch(
      pushModal({
        modal: { name: 'edit-formula-library-provider', options: { item } },
      }),
    );
  }

  function onDelete(item: FormulaLibraryItemEntity) {
    dispatch(
      pushModal({
        modal: {
          name: 'confirm-formula-library-item-delete',
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
            Queries and providers that every formula card can use. A card uses a
            query by its name in quotes, for example QUERY("groceries"). A query
            on a card wins over a library query with the same name. A provider
            is a named formula. A card uses a provider by its name without
            quotes, for example =NetIncome / 12.
          </Trans>
        </Text>
        <Search
          placeholder={t('Filter queries and providers...')}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <LibrarySection
        title={t('Queries')}
        header={
          <>
            <Cell value={t('Filters')} width="flex" />
            <Cell value={t('Time frame')} width={180} />
          </>
        }
        emptyText={
          queries.length === 0 ? (
            <Trans>No library queries</Trans>
          ) : (
            <Trans>No queries match the filter</Trans>
          )
        }
        createText={<Trans>Create new query</Trans>}
        onCreate={() => onEditQuery()}
      >
        {filteredQueries.map(item => (
          <FormulaLibraryRow
            key={item.id}
            item={item}
            uses={findUses(item)}
            isOverridden={isOverriddenLibraryItem(item, library)}
            onEdit={onEditQuery}
            onDelete={onDelete}
          />
        ))}
      </LibrarySection>

      <LibrarySection
        title={t('AQL queries')}
        header={
          <>
            <Cell value={t('Kind')} width={80} />
            <Cell value={t('Query')} width="flex" />
          </>
        }
        emptyText={
          aqlQueries.length === 0 ? (
            <Trans>No AQL queries</Trans>
          ) : (
            <Trans>No AQL queries match the filter</Trans>
          )
        }
        createText={<Trans>Create new AQL query</Trans>}
        onCreate={() => onEditAqlQuery()}
      >
        {filteredAqlQueries.map(item => (
          <FormulaLibraryAqlQueryRow
            key={item.id}
            item={item}
            uses={findUses(item)}
            isOverridden={isOverriddenLibraryItem(item, library)}
            onEdit={onEditAqlQuery}
            onDelete={onDelete}
          />
        ))}
      </LibrarySection>

      <LibrarySection
        title={t('Providers')}
        header={<Cell value={t('Formula')} width="flex" />}
        emptyText={
          providers.length === 0 ? (
            <Trans>No providers</Trans>
          ) : (
            <Trans>No providers match the filter</Trans>
          )
        }
        createText={<Trans>Create new provider</Trans>}
        onCreate={() => onEditProvider()}
      >
        {filteredProviders.map(item => (
          <FormulaLibraryProviderRow
            key={item.id}
            item={item}
            uses={findUses(item)}
            isOverridden={isOverriddenLibraryItem(item, library)}
            onEdit={onEditProvider}
            onDelete={onDelete}
          />
        ))}
      </LibrarySection>
    </View>
  );
}

type LibrarySectionProps = {
  title: string;
  // The columns between Description and Used by
  header: ReactNode;
  emptyText: ReactNode;
  createText: ReactNode;
  onCreate: () => void;
  children: ReactNode[];
};

function LibrarySection({
  title,
  header,
  emptyText,
  createText,
  onCreate,
  children,
}: LibrarySectionProps) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
        {title}
      </Text>
      <View style={styles.tableContainer}>
        <TableHeader>
          <Cell value={t('Name')} width={200} />
          <Cell value={t('Description')} width="flex" />
          {header}
          <Cell value={t('Used by')} width={100} />
          <Cell value="" width={40} />
        </TableHeader>
        {children.length === 0 ? (
          <View
            style={{
              background: theme.tableBackground,
              fontStyle: 'italic',
            }}
          >
            <Text style={{ margin: 'auto', padding: '20px' }}>{emptyText}</Text>
          </View>
        ) : (
          children
        )}
      </View>
      <View
        style={{
          paddingBlock: 15,
          flexDirection: 'row',
          justifyContent: 'flex-end',
        }}
      >
        <Button variant="primary" onPress={onCreate}>
          {createText}
        </Button>
      </View>
    </View>
  );
}
