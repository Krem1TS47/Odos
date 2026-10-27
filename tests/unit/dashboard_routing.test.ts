import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInitialTab, VALID_TABS } from '../../extension/src/dashboard/App';

describe('Dashboard Tab Routing & Refresh Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('recognizes all valid tabs', () => {
    expect(VALID_TABS).toEqual(['applications', 'profile', 'answers', 'settings']);
  });

  it('restores "applications" tab from URL hash #applications on refresh', () => {
    window.location.hash = '#applications';
    expect(getInitialTab()).toBe('applications');
  });

  it('restores "applications" tab from URL hash with slash #/applications', () => {
    window.location.hash = '#/applications';
    expect(getInitialTab()).toBe('applications');
  });

  it('restores "answers" and "settings" tabs from URL hash', () => {
    window.location.hash = '#answers';
    expect(getInitialTab()).toBe('answers');

    window.location.hash = '#settings';
    expect(getInitialTab()).toBe('settings');
  });

  it('restores "applications" tab from query parameter ?tab=applications', () => {
    window.history.replaceState(null, '', '/dashboard.html?tab=applications');
    window.location.hash = '';
    expect(getInitialTab()).toBe('applications');
  });

  it('falls back to localStorage when no hash or query is present', () => {
    localStorage.setItem('odos_active_tab', 'applications');
    window.history.replaceState(null, '', '/dashboard.html');
    window.location.hash = '';

    expect(getInitialTab()).toBe('applications');
  });

  it('prioritizes URL hash over localStorage if both exist', () => {
    localStorage.setItem('odos_active_tab', 'settings');
    window.location.hash = '#applications';

    expect(getInitialTab()).toBe('applications');
  });

  it('defaults to "profile" when no hash, query, or storage is set', () => {
    window.history.replaceState(null, '', '/dashboard.html');
    window.location.hash = '';
    localStorage.clear();

    expect(getInitialTab()).toBe('profile');
  });
});
