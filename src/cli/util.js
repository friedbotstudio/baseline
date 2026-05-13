import { access } from 'node:fs/promises';

export async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
