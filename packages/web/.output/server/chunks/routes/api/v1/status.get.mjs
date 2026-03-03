import { d as defineEventHandler, a as getQuery, u as useCodeIndexer, g as getWorkspacePath } from '../../../nitro/nitro.mjs';
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

const status_get = defineEventHandler(async (event) => {
  const query = getQuery(event);
  const indexer = useCodeIndexer();
  const workspacePath = query.workspacePath || getWorkspacePath();
  return indexer.getIndexStatus(workspacePath);
});

export { status_get as default };
//# sourceMappingURL=status.get.mjs.map
