import { isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveProjectPath(root: string, relPath: string, label: string): string {
  if (isAbsolute(relPath)) {
    throw new Error(`${label} must be relative to the project root`);
  }

  const projectRoot = resolve(root);
  const target = resolve(projectRoot, relPath);
  const rel = relative(projectRoot, target);
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) {
    return target;
  }

  throw new Error(`${label} must stay within the project root`);
}
