import { extractRestoreToken } from './billing/credits.js';

const TOKEN = 'aB3dEf7hJk9mNp2qRs5tUv8wXy1zC4eG';

describe('extractRestoreToken — what users actually paste', () => {
  test('the whole recovery URL (the common case)', () => {
    expect(extractRestoreToken(`https://aira.tiredtoretire.com/?restore=${TOKEN}`)).toBe(TOKEN);
  });

  test('a URL where restore is not the first param', () => {
    expect(extractRestoreToken(`https://aira.tiredtoretire.com/?utm=mail&restore=${TOKEN}`)).toBe(TOKEN);
  });

  test('a URL with a trailing fragment or extra params', () => {
    expect(extractRestoreToken(`https://x.dev/?restore=${TOKEN}&v=2#top`)).toBe(TOKEN);
    expect(extractRestoreToken(`https://x.dev/?restore=${TOKEN}#top`)).toBe(TOKEN);
  });

  test('surrounding whitespace and newlines from a copy/paste', () => {
    expect(extractRestoreToken(`\n  https://x.dev/?restore=${TOKEN}  \n`)).toBe(TOKEN);
  });

  test('a bare token', () => {
    expect(extractRestoreToken(TOKEN)).toBe(TOKEN);
    expect(extractRestoreToken(`  ${TOKEN} `)).toBe(TOKEN);
  });

  test('a percent-encoded token is decoded', () => {
    expect(extractRestoreToken('https://x.dev/?restore=ab%2Dcd%5Fef1234567890')).toBe('ab-cd_ef1234567890');
  });

  test('a query fragment on its own', () => {
    expect(extractRestoreToken(`?restore=${TOKEN}`)).toBe(TOKEN);
  });
});

describe('extractRestoreToken — rejected before hitting the server', () => {
  test.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['not a link at all', 'prose'],
    ['https://aira.tiredtoretire.com/', 'a URL with no restore param'],
    ['short', 'too short to be a token'],
  ])('%s (%s) -> null', (input) => {
    expect(extractRestoreToken(input)).toBeNull();
  });

  test('a whole page of pasted text is not sent as a token', () => {
    expect(extractRestoreToken('AiRA Credits 0 Buy Credits\nNo credits found on this device')).toBeNull();
  });

  test('null/undefined do not throw', () => {
    expect(extractRestoreToken(null)).toBeNull();
    expect(extractRestoreToken(undefined)).toBeNull();
  });
});
