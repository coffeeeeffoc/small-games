import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export const editor =
  process.env.COCOS_CREATOR ||
  (existsSync('D:/tools/cocos/CocosCreator.exe')
    ? 'D:/tools/cocos/CocosCreator.exe'
    : path.join(os.homedir(), '.cache/cocos/3.8.8/CocosCreator.exe'));
export const editorRoot = path.dirname(editor);
