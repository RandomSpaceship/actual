import React from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Popover } from '@actual-app/components/popover';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryProviderEntity } from '@actual-app/core/types/models';

import { Cell } from '#components/table';

import type { FormulaQueryUse } from './formulaQueryUses';
import { FormulaQueryUsesList } from './FormulaQueryUsesList';

type FormulaLibraryUsesCellProps = {
  name: string;
  uses: { cards: FormulaQueryUse[]; providers: FormulaLibraryProviderEntity[] };
};

export function FormulaLibraryUsesCell({
  name,
  uses: { cards, providers },
}: FormulaLibraryUsesCellProps) {
  const { t } = useTranslation();

  return (
    <Cell width={100} plain style={{ padding: '10px 5px' }}>
      {cards.length === 0 && providers.length === 0 ? (
        <Text style={{ color: theme.pageTextSubdued }}>
          <Trans>Not used</Trans>
        </Text>
      ) : (
        <DialogTrigger>
          <Button
            variant="bare"
            style={{ flexDirection: 'column', alignItems: 'flex-start' }}
          >
            {cards.length > 0 && (
              <Text>
                <Trans count={cards.length}>
                  {{ count: cards.length }} cards
                </Trans>
              </Text>
            )}
            {providers.length > 0 && (
              <Text>
                <Trans count={providers.length}>
                  {{ count: providers.length }} providers
                </Trans>
              </Text>
            )}
          </Button>
          <Popover placement="bottom end">
            <Dialog aria-label={t('Uses of {{name}}', { name })}>
              <View style={{ padding: 15, width: 400 }}>
                <FormulaQueryUsesList uses={cards} providers={providers} />
              </View>
            </Dialog>
          </Popover>
        </DialogTrigger>
      )}
    </Cell>
  );
}
