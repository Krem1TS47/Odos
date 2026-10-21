import React, { useState } from 'react';
import { parseFullYamlConfig } from '../../core/config';
import { repository } from '../../core/storage/repository';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const YamlImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [profileYaml, setProfileYaml] = useState('');
  const [answersYaml, setAnswersYaml] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Import YAML Configuration
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload or paste your <code className="font-mono text-foreground font-medium">profile.yaml</code> and <code className="font-mono text-foreground font-medium">answers.yaml</code> to import your personal info, work authorization, education, and answers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">profile.yaml</Label>
              <label className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-medium underline underline-offset-2">
                Upload File
                <input
                  type="file"
                  accept=".yaml,.yml"
                  className="hidden"
                  onChange={(e) => handleFileUpload('profile', e)}
                />
              </label>
            </div>
            <Textarea
              rows={5}
              placeholder="Paste content of profile.yaml here..."
              value={profileYaml}
              onChange={(e) => setProfileYaml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">answers.yaml</Label>
              <label className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-medium underline underline-offset-2">
                Upload File
                <input
                  type="file"
                  accept=".yaml,.yml"
                  className="hidden"
                  onChange={(e) => handleFileUpload('answers', e)}
                />
              </label>
            </div>
            <Textarea
              rows={4}
              placeholder="Paste content of answers.yaml here..."
              value={answersYaml}
              onChange={(e) => setAnswersYaml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        {status.type === 'error' && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{status.message}</span>
          </div>
        )}

        {status.type === 'success' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span>{status.message}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={status.type === 'loading'}
            onClick={handleImport}
          >
            {status.type === 'loading' ? 'Importing...' : 'Import Data'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
