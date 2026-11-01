import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export async function writeReport(filename, content) {
  // Windows readers can retain the previous report briefly after Creator exits.
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFile(filename, content);
      return;
    } catch (error) {
      if (process.platform !== 'win32' || !['UNKNOWN', 'EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 40) throw error;
      await delay(250);
    }
  }
}
