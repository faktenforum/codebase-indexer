import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const workspacePath = body?.workspacePath || getWorkspacePath();
  const filePath = body?.filePath;

  if (!workspacePath) {
    throw createError({ statusCode: 400, statusMessage: 'workspacePath is required' });
  }
  if (!filePath || typeof filePath !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'filePath is required' });
  }

  const limit = typeof body.limit === 'number' ? body.limit : 50;
  const indexer = useCodeIndexer();
  const chunks = await indexer.rechunkFileForDebug(workspacePath, filePath, limit);

  return { chunks };
});
