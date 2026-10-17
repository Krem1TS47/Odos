import React, { useState, useEffect } from 'react';
import { Profile, StoredAnswer, Job, Application, DEFAULT_PROFILE } from '../core/models';
import { repository } from '../core/storage/repository';
import { ProfileEditor } from './components/ProfileEditor';
import { AnswersEditor } from './components/AnswersEditor';
import { ApplicationsView } from './components/ApplicationsView';
import { SettingsView } from './components/SettingsView';
import { YamlImportModal } from './components/YamlImportModal';
import { Briefcase, UserCheck, MessageSquareQuote, Settings, Upload } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'applications' | 'profile' | 'answers' | 'settings'>('profile');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [answers, setAnswers] = useState<StoredAnswer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              O
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-lg tracking-tight">Odos</span>
                <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Local-First Job Application Hub</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm"
            >
              <Upload className="h-3.5 w-3.5" /> Import v1 YAML
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-1 flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-56 flex-shrink-0">
          <nav className="space-y-1 bg-white p-2 rounded-xl border border-slate-200 shadow-sm sticky top-24">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'profile'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserCheck className="h-4 w-4" /> Profile & Resumes
            </button>

            <button
              onClick={() => setActiveTab('answers')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'answers'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MessageSquareQuote className="h-4 w-4" /> Stored Answers ({answers.length})
            </button>

            <button
              onClick={() => setActiveTab('applications')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'applications'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Briefcase className="h-4 w-4" /> Applications ({applications.length})
            </button>

            <div className="pt-2 border-t border-slate-100 mt-2">
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Settings className="h-4 w-4" /> Settings & Privacy
              </button>
            </div>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-xs text-slate-500">Loading data from IndexedDB...</div>
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
