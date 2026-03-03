import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const indexer = useCodeIndexer();
  const workspacePath = (query.workspacePath as string) || getWorkspacePath();

  const isEnabled = indexer.isEnabled();
  const hasIndex = await indexer.hasIndex(workspacePath);
  const stats = await indexer.getIndexStats(workspacePath);

  return {
    isEnabled,
    hasIndex,
    fileCount: stats?.fileCount ?? null,
  };
});
