import { expect, type Page } from '@playwright/test';
import { env } from '../config/env.config';

type Kind = 'candidate' | 'asset' | 'meeting';
type Record = { id?: string; email?: string; serial?: string; title?: string };
const decode = (value: string): string => value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');


export async function cleanupOwned(page: Page, kind: Kind, record: Record, marker: string): Promise<void> {
  const key = (kind === 'candidate' ? record.email : kind === 'asset' ? record.serial : record.title)!;
  expect(marker.length, 'Cleanup requires the registered ownership marker').toBeGreaterThanOrEqual(3);
  expect(key, 'Never clean seed or another test record').toContain(marker);
  const route = kind === 'candidate' ? '/recruitment/list-candidate/' : kind === 'asset' ? '/asset/asset-category-list/' : '/pms/meetings-list/';
  const params: { [key: string]: string } = kind === 'candidate' ? { email: key, is_active: 'unknown', filter_applied: 'on' }
    : kind === 'asset' ? { asset_tracking_id: key, nested_fields: 'asset_category_id', filter_applied: 'on' }
    : { search: key, is_active: 'unknown', filter_applied: 'on' };
  async function lookup(): Promise<{ id: string; html: string }[]> {
    const response = await page.request.get(route, { params, headers: { 'HX-Request': 'true' } });
    expect(response.status(), 'Owned-record lookup must succeed').toBe(200);
    expect(new URL(response.url()).pathname, 'Do not interpret a login redirect as an empty list').toBe(route);
    const html = await response.text();
    return [...html.matchAll(/<tr\b[^>]*data-instance-id=["'](\d+)["'][^>]*>[\s\S]*?<\/tr>/g)]
      .filter(match => decode(match[0].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').includes(key))
      .map(match => ({ id: match[1], html: match[0] }));
  }
  const rows = await lookup();
  if (!rows.length) return;
  expect(rows.map(row => row.id), 'Ownership marker must resolve to exactly one row').toHaveLength(1);
  const row = rows[0];
  if (record.id) expect(row.id, 'Cleanup must target the registered database ID').toBe(record.id);
  let endpoint: URL;
  if (kind === 'candidate') {
    expect(row.html, 'Never delete a converted employee').not.toMatch(/title=["']Converted["']/);
    const link = [...row.html.matchAll(/\bhx-get=["']([^"']+)["']/g)].map(match => decode(match[1])).find(value => value.includes('/generic-delete/'));
    expect(link, 'Candidate row must expose the real Delete action').toBeTruthy();
    const preview = new URL(link!, env.baseURL);
    expect(preview.origin, 'Delete preview must stay on the test website').toBe(new URL(env.baseURL).origin);
    expect(preview.searchParams.get('model')).toBe('recruitment.Candidate');
    expect(preview.searchParams.get('pk')).toBe(row.id);
    const response = await page.request.get(preview.href, { headers: { 'HX-Request': 'true' } });
    expect(response.status()).toBe(200);
    const form = [...(await response.text()).matchAll(/\bhx-post=["']([^"']+)["']/g)].map(match => decode(match[1])).find(value => value.includes('/generic-delete/'));
    expect(form, 'Delete confirmation must expose its POST endpoint').toBeTruthy();
    endpoint = new URL(form!, env.baseURL);
    expect(endpoint.searchParams.get('model')).toBe('recruitment.Candidate');
    expect(endpoint.searchParams.get('pk')).toBe(row.id);
  } else {
    const pathname = kind === 'asset' ? `/asset/asset-delete/${row.id}/` : `/pms/meetings-delete/${row.id}/`;
    const action = [...row.html.matchAll(/\bhx-post=["']([^"']+)["']/g)].map(match => decode(match[1])).find(value => new URL(value, env.baseURL).pathname === pathname);
    expect(action, 'Owned row must expose its actual Delete endpoint').toBeTruthy();
    endpoint = new URL(action!, env.baseURL);
    expect(endpoint.pathname).toBe(pathname);
  }
  expect(endpoint.origin, 'Cleanup must stay on the configured test website').toBe(new URL(env.baseURL).origin);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrftoken')?.value;
  expect(csrf, 'Authenticated Django CSRF cookie').toBeTruthy();
  const response = await page.request.post(endpoint.href, {
    form: kind === 'candidate' ? { action: 'on', revert: 'on', confirm: 'on' } : {},
    headers: { 'HX-Request': 'true', 'X-CSRFToken': csrf!, Referer: new URL(route, env.baseURL).href },
  });
  expect(response.status(), 'Owned-record cleanup POST').toBeLessThan(400);
  expect((await lookup()).map(row => row.id), 'Owned record must be absent after teardown').toHaveLength(0);
}
