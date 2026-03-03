import { d as defineEventHandler, r as readBody, u as useCodeIndexer, g as getWorkspacePath } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'vue-router';
import 'node:url';
import 'node:child_process';
import 'ignore';
import 'node:module';
import '@iconify/utils';
import 'consola';

const reindex_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const indexer = useCodeIndexer();
  const workspacePath = (body == null ? void 0 : body.workspacePath) || getWorkspacePath();
  const force = (body == null ? void 0 : body.force) === true;
  const state = await indexer.indexWorkspace(workspacePath, { force });
  return state;
});

export { reindex_post as default };
//# sourceMappingURL=reindex.post.mjs.map
