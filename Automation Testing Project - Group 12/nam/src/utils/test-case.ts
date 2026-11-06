import { test } from '../fixtures/auth.fixture';
export function caseTitle(id: string, title: string, options: { write?: boolean; smoke?: boolean }): string {
  const tags = [options.write ? '@write' : '@read', options.smoke ? '@smoke' : ''].filter(Boolean).join(' ');
  return `${id} - ${title} ${tags}`;
}
export function blockedIf(condition: boolean, reason: string): void { test.skip(condition, `Blocked: ${reason}`); }
export { expect, test } from '../fixtures/auth.fixture';
