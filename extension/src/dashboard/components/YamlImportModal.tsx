import React, { useState } from 'react';
import { parseFullYamlConfig } from '../../core/config';
import { repository } from '../../core/storage/repository';
import { Upload, AlertCircle, CheckCircle, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const YamlImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [profileYaml, setProfileYaml] = useState('');
  const [answersYaml, setAnswersYaml] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  if (!isOpen) return null;

  const handleFileUpload = (type: 'profile' | 'answers', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (type === 'profile') setProfileYaml(text);
      if (type === 'answers') setAnswersYaml(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    try {
      setStatus({ type: 'loading' });
      if (!profileYaml.trim() && !answersYaml.trim()) {
        setStatus({ type: 'error', message: 'Please provide either profile.yaml or answers.yaml content.' });
        return;
      }

      const result = parseFullYamlConfig(profileYaml || undefined, answersYaml || undefined);

      if (profileYaml.trim() && result.profile) {
        await repository.saveProfile(result.profile);
      }

      for (const ans of result.answers) {
        await repository.upsertAnswer(ans);
      }

      setStatus({
        type: 'success',
        message: `Imported successfully! Profile updated and ${result.answers.length} stored answers saved.`
      });

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to parse YAML.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Import YAML Configuration</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Upload or paste your <code>profile.yaml</code> and <code>answers.yaml</code> to import your personal info, work authorization, education, and answers.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">profile.yaml</label>
              <label className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">
                Upload File
                <input type="file" accept=".yaml,.yml" className="hidden" onChange={(e) => handleFileUpload('profile', e)} />
              </label>
            </div>
            <textarea
              rows={5}
              placeholder="Paste content of profile.yaml here..."
              value={profileYaml}
              onChange={(e) => setProfileYaml(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">answers.yaml</label>
              <label className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">
                Upload File
                <input type="file" accept=".yaml,.yml" className="hidden" onChange={(e) => handleFileUpload('answers', e)} />
              </label>
            </div>
            <textarea
              rows={4}
              placeholder="Paste content of answers.yaml here..."
              value={answersYaml}
              onChange={(e) => setAnswersYaml(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {status.type === 'error' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{status.message}</span>
          </div>
        )}

        {status.type === 'success' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span>{status.message}</span>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={status.type === 'loading'}
            onClick={handleImport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {status.type === 'loading' ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>
    </div>
  );
};
