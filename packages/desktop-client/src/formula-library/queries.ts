import { q } from '@actual-app/core/shared/query';
import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

import { aqlQuery } from '#queries/aqlQuery';

export const formulaLibraryQueries = {
  all: () => ['formula-library'],
  lists: () => [...formulaLibraryQueries.all(), 'lists'],
  // Oldest first, because the oldest item wins a duplicate name
  list: () =>
    queryOptions<FormulaLibraryItemEntity[]>({
      queryKey: [...formulaLibraryQueries.lists()],
      queryFn: async () => {
        const { data }: { data: FormulaLibraryItemEntity[] } = await aqlQuery(
          q('formula_library').select('*'),
        );
        return data;
      },
      staleTime: Infinity,
    }),
};
