import React, { useState, useEffect } from 'react';
import { repository } from '../../core/storage/repository';
import { exportProfileToYaml, exportAnswersToYaml } from '../../core/config/yamlExporter';
import { Trash2, Download, Key, AlertTriangle, FileCode, Check } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

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

  const handleExportProfileYaml = async () => {
    const profile = await repository.getProfile();
    const yamlContent = exportProfileToYaml(profile);
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profile.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAnswersYaml = async () => {
    const answers = await repository.listAnswers();
    const yamlContent = exportAnswersToYaml(answers);
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'answers.yaml';
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
    <div className="space-y-6 max-w-3xl">
      {/* LLM Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Key className="h-4 w-4 text-foreground" /> Gemini API Key
          </CardTitle>
          <CardDescription className="text-xs">
            Odos uses your private Gemini API key solely for drafting plain text answers to unmatched open-ended questions. Your key is stored in <code className="font-mono text-foreground font-medium">chrome.storage.local</code> and never synced or transmitted elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              onClick={handleSaveKey}
              size="sm"
              className="gap-1.5"
            >
              {keySaved ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Saved
                </>
              ) : (
                'Save Key'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Repo YAML Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCode className="h-4 w-4 text-foreground" /> Repo YAML Configuration
          </CardTitle>
          <CardDescription className="text-xs">
            You can edit your profile, education, experience, and stored answers directly in <code className="font-mono text-foreground font-medium">config/profile.yaml</code> and <code className="font-mono text-foreground font-medium">config/answers.yaml</code> in your code editor.
            Download updated YAML files below or reload the extension from the repository config.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportProfileYaml}
              className="gap-1.5 text-xs font-normal"
            >
              <Download className="h-3.5 w-3.5" /> Download profile.yaml
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportAnswersYaml}
              className="gap-1.5 text-xs font-normal"
            >
              <Download className="h-3.5 w-3.5" /> Download answers.yaml
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Download className="h-4 w-4 text-foreground" /> Export Backup
          </CardTitle>
          <CardDescription className="text-xs">
            Download your complete local Odos database (applications, profiles, questions, and jobs) as a JSON file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            className="gap-1.5 text-xs font-normal"
          >
            <Download className="h-3.5 w-3.5" /> Export All Data (JSON)
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone: Wipe Data */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </CardTitle>
          <CardDescription className="text-xs text-destructive/80">
            Wiping your data will permanently purge all IndexedDB tables (profile, resumes, stored answers, jobs, and application history). This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleWipeData}
            className="gap-1.5 text-xs font-medium"
          >
            <Trash2 className="h-3.5 w-3.5" /> Wipe All Local Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
