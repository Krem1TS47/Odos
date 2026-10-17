import React, { useState, useEffect } from 'react';
import { repository } from '../../core/storage/repository';
import { Trash2, Download, Key, AlertTriangle } from 'lucide-react';

interface Props {
  onDataReset: () => void;
}

export const SettingsView: React.FC<Props> = ({ onDataReset }) => {
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['gemini_api_key'], (res) => {
        if (res.gemini_api_key) setApiKey(res.gemini_api_key);
      });
    }
  }, []);

  const handleSaveKey = () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ gemini_api_key: apiKey.trim() }, () => {
        setKeySaved(true);
        setTimeout(() => setKeySaved(false), 2000);
      });
    }
  };

  const handleExportJson = async () => {
    const profile = await repository.getProfile();
    const answers = await repository.listAnswers();
    const jobs = await repository.listJobs();
    const applications = await repository.listApplications();

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      answers,
      jobs,
      applications
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `odos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWipeData = async () => {
    const confirmText = prompt('This will permanently delete all local jobs, applications, stored answers, and profiles.\n\nType "DELETE" to confirm:');
    if (confirmText === 'DELETE') {
      await repository.wipeAllData();
      alert('All local Odos data has been erased.');
      onDataReset();
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* LLM Key */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Key className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-slate-900">Gemini API Key</h3>
        </div>
        <p className="text-xs text-slate-600 mb-4">
          Odos uses your private Gemini API key solely for drafting plain text answers to unmatched open-ended questions. Your key is stored in <code>chrome.storage.local</code> and never synced or transmitted elsewhere.
        </p>

        <div className="flex gap-2">
          <input
            type="password"
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 p-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveKey}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {keySaved ? 'Saved!' : 'Save Key'}
          </button>
        </div>
      </div>

      {/* Export Backup */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Download className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-slate-900">Export Backup</h3>
        </div>
        <p className="text-xs text-slate-600 mb-4">
          Download your complete local Odos database (applications, profiles, questions, and jobs) as a JSON file.
        </p>
        <button
          type="button"
          onClick={handleExportJson}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Download className="h-4 w-4" /> Export All Data (JSON)
        </button>
      </div>

      {/* Danger Zone: Wipe Data */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-base font-semibold">Danger Zone</h3>
        </div>
        <p className="text-xs text-red-600 mb-4">
          Wiping your data will permanently purge all IndexedDB tables (profile, resumes, stored answers, jobs, and application history). This action cannot be undone.
        </p>
        <button
          type="button"
          onClick={handleWipeData}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm"
        >
          <Trash2 className="h-4 w-4" /> Wipe All Local Data
        </button>
      </div>
    </div>
  );
};
