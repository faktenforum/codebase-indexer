import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const workspacePath = (query.workspacePath as string) || getWorkspacePath();

  if (!workspacePath) {
    throw createError({ statusCode: 400, statusMessage: 'workspacePath is required' });
  }

  const indexer = useCodeIndexer();
  const files = await indexer.listIndexedFiles(workspacePath);

  return { files };
});
