import React, { useState, useEffect } from 'react';
import { Profile, StoredAnswer, Job, Application, DEFAULT_PROFILE } from '../core/models';
import { repository } from '../core/storage/repository';
import { ProfileEditor } from './components/ProfileEditor';
import { AnswersEditor } from './components/AnswersEditor';
import { ApplicationsView } from './components/ApplicationsView';
import { SettingsView } from './components/SettingsView';
import { YamlImportModal } from './components/YamlImportModal';
import { Briefcase, UserCheck, MessageSquareQuote, Settings, Upload, RefreshCw, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import bundledConfig from '../core/config/bundledConfig.json';

export type TabKey = 'applications' | 'profile' | 'answers' | 'settings';

export const VALID_TABS: TabKey[] = ['applications', 'profile', 'answers', 'settings'];

export function getInitialTab(): TabKey {
  if (typeof window === 'undefined') return 'profile';

  // 1. Check URL hash (e.g. #applications or #/applications)
  const hash = window.location.hash.replace(/^#[/]?/, '').toLowerCase().trim();
  if (VALID_TABS.includes(hash as TabKey)) {
    return hash as TabKey;
  }

  // 2. Check query string parameter (e.g. ?tab=applications or ?page=applications)
  try {
    const params = new URLSearchParams(window.location.search);
    const tabParam = (params.get('tab') || params.get('page') || '').toLowerCase().trim();
    if (VALID_TABS.includes(tabParam as TabKey)) {
      return tabParam as TabKey;
    }
  } catch {}

  // 3. Fallback to localStorage
  try {
    const savedTab = localStorage.getItem('odos_active_tab')?.toLowerCase().trim();
    if (savedTab && VALID_TABS.includes(savedTab as TabKey)) {
      return savedTab as TabKey;
    }
  } catch {}

  return 'profile';
}

export const App: React.FC = () => {
  const [activeTab, setActiveTabState] = useState<TabKey>(getInitialTab);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [answers, setAnswers] = useState<StoredAnswer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [profileIssue, setProfileIssue] = useState<string | null>(null);

  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('odos_active_tab', tab);
      if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
        window.history.replaceState(null, '', `#${tab}`);
      }
    } catch {}
  };

  useEffect(() => {
    const handleLocationChange = () => {
      const currentTab = getInitialTab();
      setActiveTabState(currentTab);
    };

    // Keep URL in sync on initial mount if hash is missing
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace(/^#[/]?/, '').toLowerCase().trim();
      if (!VALID_TABS.includes(currentHash as TabKey)) {
        window.history.replaceState(null, '', `#${activeTab}`);
      }
    }

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const loadData = async () => {
    try {
      const [loadedProfile, loadedAnswers, loadedJobs, loadedApps] = await Promise.all([
        repository.getProfile(),
        repository.listAnswers(),
        repository.listJobs(),
        repository.listApplications()
      ]);
      setProfile(loadedProfile);
      setAnswers(loadedAnswers);
      setJobs(loadedJobs);
      setApplications(loadedApps);
      const status = repository.getProfileLoadStatus();
      setProfileIssue(status.ok ? null : status.issue);
    } finally {
      setLoading(false);
    }
  };

  const handleReloadFromYaml = async () => {
    try {
      const result = await repository.syncFromYamlConfig(bundledConfig as any, true);
      const updatedProfile = await repository.getProfile();
      const updatedAnswers = await repository.listAnswers();
      setProfile(updatedProfile);
      setAnswers(updatedAnswers);
      setSyncStatus(`Synced from repo YAML (${updatedAnswers.length} answers, resume: ${result.hasResume ? 'Yes' : 'None'})`);
      setTimeout(() => setSyncStatus(null), 3500);

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SYNC_FROM_REPO_CONFIG' }, () => {
          if (chrome.runtime.lastError) {
            // Service worker inactive fallback
          }
        });
      }
    } catch (err: any) {
      console.error('[Odos Sync Error]', err);
      alert('Failed to sync: ' + (err?.message || 'Unknown error'));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-zinc-900 selection:text-zinc-50">
      {/* Top Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-zinc-950 text-zinc-50 flex items-center justify-center font-bold text-sm shadow-sm ring-1 ring-zinc-800">
              O
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight">Odos</span>
                <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 px-1.5 font-normal">
                  v2.0
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Local-First Application Hub</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {syncStatus && (
              <span className="text-xs text-foreground bg-muted border border-border px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-in fade-in">
                <Check className="h-3 w-3" /> {syncStatus}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReloadFromYaml}
              title="Re-read profile.yaml & answers.yaml from repository config"
              className="gap-1.5 text-xs font-normal"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /> Reload from YAML
            </Button>
            <Button
              size="sm"
              onClick={() => setIsImportModalOpen(true)}
              className="gap-1.5 text-xs font-medium"
            >
              <Upload className="h-3.5 w-3.5" /> Import YAML
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-56 flex-shrink-0">
          <nav className="space-y-1 bg-card p-1.5 rounded-xl border border-border shadow-sm sticky top-20">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all text-left ${
                activeTab === 'profile'
                  ? 'bg-zinc-950 text-zinc-50 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
              }`}
            >
              <UserCheck className="h-4 w-4 flex-shrink-0" />
              <span>Profile & Resumes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('answers')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all text-left ${
                activeTab === 'answers'
                  ? 'bg-zinc-950 text-zinc-50 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquareQuote className="h-4 w-4 flex-shrink-0" />
                <span>Answers</span>
              </div>
              <Badge variant={activeTab === 'answers' ? 'secondary' : 'outline'} className="text-[10px] font-mono h-4 px-1.5">
                {answers.length}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('applications')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all text-left ${
                activeTab === 'applications'
                  ? 'bg-zinc-950 text-zinc-50 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Briefcase className="h-4 w-4 flex-shrink-0" />
                <span>Applications</span>
              </div>
              <Badge variant={activeTab === 'applications' ? 'secondary' : 'outline'} className="text-[10px] font-mono h-4 px-1.5">
                {applications.length}
              </Badge>
            </button>

            <Separator className="my-1.5 opacity-60" />

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all text-left ${
                activeTab === 'settings'
                  ? 'bg-zinc-950 text-zinc-50 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
              }`}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Settings</span>
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {profileIssue && (
            <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Profile not loaded:</strong> {profileIssue}
            </div>
          )}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-xs text-muted-foreground font-mono">Loading data from IndexedDB...</div>
            </div>
          ) : (
            <>
              {activeTab === 'profile' && (
                <ProfileEditor profile={profile} onUpdate={loadData} />
              )}
              {activeTab === 'answers' && (
                <AnswersEditor answers={answers} onUpdate={loadData} />
              )}
              {activeTab === 'applications' && (
                <ApplicationsView applications={applications} jobs={jobs} onUpdate={loadData} />
              )}
              {activeTab === 'settings' && (
                <SettingsView onDataReset={loadData} />
              )}
            </>
          )}
        </main>
      </div>

      <YamlImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};
