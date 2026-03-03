import { useCodeIndexer, getWorkspacePath } from '../../middleware/01.indexer-init';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const indexer = useCodeIndexer();
  const workspacePath = body?.workspacePath || getWorkspacePath();

  const released = indexer.releaseLock(workspacePath);
  return { released };
});
