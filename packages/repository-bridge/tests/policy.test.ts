import { describe, expect, it } from 'vitest';
import { isEditableSourcePath, isTextContent } from '@coffeeeeffoc/repository-bridge';

describe('Repository Bridge edit policy', () => {
  it('allows text sources below a Game directory', () => {
    expect(isEditableSourcePath('index.html')).toBe(true);
    expect(isEditableSourcePath('src/domain/model.ts')).toBe(true);
    expect(isEditableSourcePath('src/view/CultivationGame.tsx')).toBe(true);
    expect(isEditableSourcePath('src/manifest.json')).toBe(true);
    expect(isEditableSourcePath('src/styles.css')).toBe(true);
    expect(isEditableSourcePath('scripts/smoke.mjs')).toBe(true);
    expect(isEditableSourcePath('src/evil&name.ts')).toBe(true);
  });

  it('rejects binaries, traversal, absolute paths, and separators outside the contract', () => {
    expect(isEditableSourcePath('src/assets/logo.png')).toBe(false);
    expect(isEditableSourcePath('src/game.node')).toBe(false);
    expect(isEditableSourcePath('../package.json')).toBe(false);
    expect(isEditableSourcePath('src/../../secret.ts')).toBe(false);
    expect(isEditableSourcePath('/etc/passwd')).toBe(false);
    expect(isEditableSourcePath('C:\\Windows\\system.ts')).toBe(false);
    expect(isEditableSourcePath('')).toBe(false);
    expect(isEditableSourcePath('src/')).toBe(false);
    expect(isEditableSourcePath('src//model.ts')).toBe(false);
    expect(isEditableSourcePath('src/./model.ts')).toBe(false);
  });

  it('accepts plain text and rejects content that cannot round-trip UTF-8', () => {
    expect(isTextContent('')).toBe(true);
    expect(isTextContent('export const safe = true;\n')).toBe(true);
    expect(isTextContent('第一行\r\n第二行\t缩进 → ok\n')).toBe(true);
    expect(isTextContent('binary\u0000content')).toBe(false);
    expect(isTextContent('escape\u001b[31m')).toBe(false);
    expect(isTextContent('lone \ud800 surrogate')).toBe(false);
  });
});
