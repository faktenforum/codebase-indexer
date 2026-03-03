import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const indexer = useCodeIndexer();
  const workspacePath = (query.workspacePath as string) || getWorkspacePath();
  return indexer.getIndexStatus(workspacePath);
});
