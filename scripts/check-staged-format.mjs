import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export async function checkStagedFormat(cwd = process.cwd()) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  // Disabling rename detection represents a rename as a deletion plus its new path.
  // NUL separators preserve spaces and other special characters in file names.
  const entries = git(root, [
    'diff',
    '--cached',
    '--raw',
    '--no-abbrev',
    '--no-renames',
    '--diff-filter=ACMT',
    '-z',
  ]).split('\0');
  const result = { checked: 0, unformatted: [], errors: [] };
  const ignorePath = ['.gitignore', '.prettierignore'].map((file) => path.join(root, file));

  for (let index = 0; index + 1 < entries.length; index += 2) {
    const metadata = entries[index].split(' ');
    const relative = entries[index + 1];
    // Check only regular staged files, not symlinks or submodule gitlinks.
    if (!['100644', '100755'].includes(metadata[1])) continue;
    const filepath = path.join(root, relative);
    try {
      // Like the CLI, resolve configuration and ignores from the working tree.
      // File contents always come from the staged blob, even for partial staging.
      const info = await prettier.getFileInfo(filepath, { ignorePath });
      if (info.ignored) continue;
      const options = await prettier.resolveConfig(filepath, { editorconfig: true });
      if (!info.inferredParser && !options?.parser) continue;
      const content = git(root, ['cat-file', 'blob', metadata[3]]);
      result.checked++;
      if (!(await prettier.check(content, { ...options, filepath })))
        result.unformatted.push(relative);
    } catch (error) {
      result.errors.push({ path: relative, message: error.message });
    }
  }
  return result;
}

async function main() {
  const result = await checkStagedFormat();
  for (const file of result.unformatted) console.error(`[warn] ${file}`);
  for (const error of result.errors) console.error(`[error] ${error.path}: ${error.message}`);
  if (result.unformatted.length || result.errors.length) {
    console.error('Staged formatting check failed. Format the listed files and stage them again.');
    process.exitCode = 1;
  } else {
    console.log(`Staged formatting check passed (${result.checked} files).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
