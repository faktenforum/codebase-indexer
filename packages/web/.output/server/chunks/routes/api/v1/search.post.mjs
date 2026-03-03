import { d as defineEventHandler, r as readBody, c as createError, u as useCodeIndexer, g as getWorkspacePath } from '../../../nitro/nitro.mjs';
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

const search_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const query = body == null ? void 0 : body.query;
  if (!query || typeof query !== "string" || !query.trim()) {
    throw createError({ statusCode: 400, statusMessage: "query is required" });
  }
  const indexer = useCodeIndexer();
  const workspacePath = body.workspacePath || getWorkspacePath();
  const results = await indexer.searchWorkspace(workspacePath, query.trim(), {
    pathPrefix: body.path || void 0,
    limit: typeof body.limit === "number" ? body.limit : 20
  });
  return { results };
});

export { search_post as default };
//# sourceMappingURL=search.post.mjs.map
