import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, emailIssue, newPasswordIssue } from './validation.ts';

describe('sign-in form rules', () => {
  it('checks email addresses', () => {
    assert.equal(emailIssue('player@example.com'), null);
    assert.ok(emailIssue(''));
    assert.ok(emailIssue('player@'));
  });

  it('requires 8+ character passwords that match', () => {
    assert.equal(newPasswordIssue('correct horse', 'correct horse'), null);
    assert.match(newPasswordIssue('short', 'short') ?? '', /8/);
    assert.match(newPasswordIssue('long enough', 'long enougH') ?? '', /match/);
  });

  it('explains Supabase errors in plain language and never leaks raw messages', () => {
    assert.match(authErrorMessage({ code: 'invalid_credentials' }), /don’t match/);
    assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /confirm/);
    assert.match(authErrorMessage({ message: 'Failed to fetch', status: 0 }), /reach the server/);
    assert.equal(authErrorMessage({ code: 'something_new', message: 'internal detail' }), 'Something went wrong. Please try again.');
  });
});
