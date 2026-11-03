import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Paragraph } from '@actual-app/components/paragraph';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { useDeleteFormulaLibraryItemMutation } from '#formula-library';

import { FormulaQueryUsesList } from './FormulaQueryUsesList';
import { useFindFormulaQueryUses } from './useFindFormulaQueryUses';

type ConfirmFormulaLibraryQueryDeleteModalProps = {
  item: FormulaLibraryQueryEntity;
};

export function ConfirmFormulaLibraryQueryDeleteModal({
  item,
}: ConfirmFormulaLibraryQueryDeleteModalProps) {
  const { t } = useTranslation();
  const uses = useFindFormulaQueryUses()(item);
  const deleteItem = useDeleteFormulaLibraryItemMutation();

  return (
    <Modal name="confirm-formula-library-query-delete">
      {({ state }) => (
        <View style={{ maxWidth: 600, lineHeight: 1.5 }}>
          <ModalHeader
            title={t('Delete query')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          {uses.length === 0 ? (
            <Paragraph>
              <Trans>
                Delete the query "{{ name: item.name }}"? No cards use it.
              </Trans>
            </Paragraph>
          ) : (
            <>
              <Paragraph>
                <Trans count={uses.length}>
                  Delete the query "{{ name: item.name }}"?{' '}
                  {{ count: uses.length }} cards use it. They will show an error
                  until you change them or add a query with this name.
                </Trans>
              </Paragraph>
              <FormulaQueryUsesList uses={uses} />
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
