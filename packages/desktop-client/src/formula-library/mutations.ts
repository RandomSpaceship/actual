import { useTranslation } from 'react-i18next';

import { send } from '@actual-app/core/platform/client/connection';
import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';
import { dashboardQueries } from '#reports';

import { formulaLibraryQueries } from './queries';

function invalidateQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: formulaLibraryQueries.lists(),
  });
}

function dispatchErrorNotification(
  dispatch: AppDispatch,
  message: string,
  error?: Error,
) {
  dispatch(
    addNotification({
      notification: {
        id: uuidv4(),
        type: 'error',
        message,
        pre: error ? error.message : undefined,
      },
    }),
  );
}

type CreateFormulaLibraryItemPayload = Pick<
  FormulaLibraryItemEntity,
  'type' | 'name' | 'data'
>;

export function useCreateFormulaLibraryItemMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (item: CreateFormulaLibraryItemPayload) => {
      return await send('formula-library-create', item);
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error creating formula library item:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error creating the query. Please try again.'),
        error,
      );
    },
  });
}

type UpdateFormulaLibraryItemPayload = Pick<FormulaLibraryItemEntity, 'id'> &
  Partial<Pick<FormulaLibraryItemEntity, 'name' | 'data'>> & {
    // The cards whose formula text changes with a rename
    renameInWidgetIds?: string[];
  };

export function useUpdateFormulaLibraryItemMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (item: UpdateFormulaLibraryItemPayload) => {
      return await send('formula-library-update', item);
    },
    onSuccess: (_, item) => {
      invalidateQueries(queryClient);
      if (item.renameInWidgetIds?.length) {
        void queryClient.invalidateQueries({
          queryKey: dashboardQueries.lists(),
        });
      }
    },
    onError: error => {
      console.error('Error updating formula library item:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error saving the query. Please try again.'),
        error,
      );
    },
  });
}

export function useDeleteFormulaLibraryItemMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id }: Pick<FormulaLibraryItemEntity, 'id'>) => {
      return await send('formula-library-delete', { id });
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error deleting formula library item:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error deleting the query. Please try again.'),
        error,
      );
    },
  });
}
