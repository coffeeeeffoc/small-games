import { describe, expect, it } from 'vitest';
import { nativeCompetitionConfiguration } from '../scripts/competition-config.mjs';

const configuration = {
  enabled: true,
  platform: 'wechat',
  appId: 'wx1234567890123456',
  preview: false,
  apiUrl: 'https://games.example.com/api/competition/v1/',
};

describe('explicit native competition configuration', () => {
  it('requires the game opt-in, real configured AppID and an explicit API URL', () => {
    for (const override of [{ enabled: false }, { appId: '' }, { apiUrl: undefined }])
      expect(nativeCompetitionConfiguration({ ...configuration, ...override })).toBeNull();
    expect(nativeCompetitionConfiguration(configuration)).toEqual({
      platform: 'wechat',
      appId: 'wx1234567890123456',
      apiUrl: 'https://games.example.com/api/competition/v1',
    });
  });

  it('permits local HTTP only in previews and rejects credentials, queries and fragments', () => {
    expect(
      nativeCompetitionConfiguration({
        ...configuration,
        preview: true,
        apiUrl: 'http://127.0.0.1:4424/api/competition/v1',
      }),
    ).toMatchObject({
      apiUrl: 'http://127.0.0.1:4424/api/competition/v1',
    });
    for (const apiUrl of [
      'http://127.0.0.1:4424',
      'http://games.example.com',
      'https://user:secret@games.example.com',
      'https://games.example.com?token=secret',
      'https://games.example.com#token',
      'file:///tmp/service',
    ])
      expect(() => nativeCompetitionConfiguration({ ...configuration, apiUrl })).toThrow();
    expect(() =>
      nativeCompetitionConfiguration({
        ...configuration,
        preview: true,
        apiUrl: 'http://games.example.com',
      }),
    ).toThrow();
  });
});
