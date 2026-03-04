import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const workspacePath = (query.workspacePath as string) || getWorkspacePath();
  const filePath = query.filePath as string;

  if (!workspacePath) {
    throw createError({ statusCode: 400, statusMessage: 'workspacePath is required' });
  }
  if (!filePath) {
    throw createError({ statusCode: 400, statusMessage: 'filePath is required' });
  }

  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : 100;
  const indexer = useCodeIndexer();
  const chunks = await indexer.listChunksInIndex(workspacePath, filePath, limit);

  return { chunks };
});
