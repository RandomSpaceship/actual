import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Paragraph } from '@actual-app/components/paragraph';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { useDeleteFormulaLibraryItemMutation } from '#formula-library';

import { FormulaQueryUsesList } from './FormulaQueryUsesList';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

type ConfirmFormulaLibraryItemDeleteModalProps = {
  item: FormulaLibraryItemEntity;
};

export function ConfirmFormulaLibraryItemDeleteModal({
  item,
}: ConfirmFormulaLibraryItemDeleteModalProps) {
  const { t } = useTranslation();
  const { cards, namedFormulas } = useFindFormulaQueryUses()(item);
  const deleteItem = useDeleteFormulaLibraryItemMutation();
  const isNamedFormula = item.type === 'named-formula';
  const useCount = cards.length + namedFormulas.length;

  return (
    <Modal name="confirm-formula-library-item-delete">
      {({ state }) => (
        <View style={{ maxWidth: 600, lineHeight: 1.5 }}>
          <ModalHeader
            title={
              isNamedFormula ? t('Delete named formula') : t('Delete query')
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          {useCount === 0 ? (
            <Paragraph>
              {isNamedFormula ? (
                <Trans>
                  Delete the named formula "{{ name: item.name }}"? Nothing uses
                  it.
                </Trans>
              ) : (
                <Trans>
                  Delete the query "{{ name: item.name }}"? Nothing uses it.
                </Trans>
              )}
            </Paragraph>
          ) : (
            <>
              <Paragraph>
                {isNamedFormula ? (
                  <Trans count={useCount}>
                    Delete the named formula "{{ name: item.name }}"?{' '}
                    {{ count: useCount }} cards and named formulas use it. They
                    will show an error until you change them or add a named
                    formula with this name.
                  </Trans>
                ) : (
                  <Trans count={useCount}>
                    Delete the query "{{ name: item.name }}"?{' '}
                    {{ count: useCount }} cards and named formulas use it. They
                    will show an error until you change them or add a query with
                    this name.
                  </Trans>
                )}
              </Paragraph>
              <FormulaQueryUsesList
                uses={cards}
                namedFormulas={namedFormulas}
              />
            </>
          )}
          <ModalButtons style={{ marginTop: 20 }}>
            <Button style={{ marginRight: 10 }} onPress={() => state.close()}>
              <Trans>Cancel</Trans>
            </Button>
            <InitialFocus>
              <Button
                variant="primary"
                onPress={() => {
                  deleteItem.mutate({ id: item.id });
                  state.close();
                }}
              >
                <Trans>Delete</Trans>
              </Button>
            </InitialFocus>
          </ModalButtons>
        </View>
      )}
    </Modal>
  );
}
