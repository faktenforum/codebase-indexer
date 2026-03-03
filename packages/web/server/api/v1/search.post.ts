import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const query = body?.query;

  if (!query || typeof query !== 'string' || !query.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'query is required' });
  }

  const indexer = useCodeIndexer();
  const workspacePath = body.workspacePath || getWorkspacePath();

  const results = await indexer.searchWorkspace(workspacePath, query.trim(), {
    pathPrefix: body.path || undefined,
    limit: typeof body.limit === 'number' ? body.limit : 20,
  });

  return { results };
});
