import React, { useState } from 'react';
import { Application, ApplicationStatus, Job } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Briefcase, Eye, MessageSquare, ExternalLink, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../../components/ui/dialog';

interface Props {
  applications: Application[];
  jobs: Job[];
  onUpdate: () => void;
}

const ALL_STATUSES: ApplicationStatus[] = [
  'prefilled',
  'submitted',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'abandoned'
];

export const ApplicationsView: React.FC<Props> = ({ applications, jobs, onUpdate }) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'company'>('date_desc');
  const [snapshotModalApp, setSnapshotModalApp] = useState<{ app: Application; job?: Job } | null>(null);
  const [notesModalApp, setNotesModalApp] = useState<{ app: Application; job?: Job; noteText: string } | null>(null);

  const jobsMap = new Map(jobs.map((j) => [j.id, j]));

  // Filtering
  const filteredApps = applications.filter((app) => {
    if (filterStatus !== 'all' && app.status !== filterStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const job = jobsMap.get(app.jobId);
      const company = (job?.company || '').toLowerCase();
      const title = (job?.title || '').toLowerCase();
      if (!company.includes(q) && !title.includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Sorting
  filteredApps.sort((a, b) => {
    if (sortBy === 'date_desc') {
      return new Date(b.prefilledAt).getTime() - new Date(a.prefilledAt).getTime();
    }
    if (sortBy === 'date_asc') {
      return new Date(a.prefilledAt).getTime() - new Date(b.prefilledAt).getTime();
    }
    if (sortBy === 'company') {
      const compA = jobsMap.get(a.jobId)?.company || '';
      const compB = jobsMap.get(b.jobId)?.company || '';
      return compA.localeCompare(compB);
    }
    return 0;
  });

  const handleStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    try {
      await repository.updateApplicationStatus(appId, newStatus);
      onUpdate();
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    }
  };

  const handleSaveNote = async () => {
    if (!notesModalApp) return;
    try {
      await repository.addApplicationNote(notesModalApp.app.id, notesModalApp.noteText);
      setNotesModalApp(null);
      onUpdate();
    } catch (err: any) {
      alert('Error saving note: ' + err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'prefilled', 'submitted', 'interviewing', 'offer', 'rejected'].map((status) => (
            <Button
              key={status}
              type="button"
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="capitalize text-xs font-normal"
            >
              {status}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search company or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5 flex-shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="company">Company</option>
            </select>
          </div>
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground mb-3">
            <Briefcase className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No applications found</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {searchQuery || filterStatus !== 'all'
              ? 'No applications match your active search or filters.'
              : 'Open any job application page and click Prefill in the Odos extension. Your applications and submitted answer snapshots will be logged here.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-left text-xs">
            <thead className="bg-muted/40 font-medium text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Company & Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Prefilled</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredApps.map((app) => {
                const job = jobsMap.get(app.jobId);
                return (
                  <tr key={app.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground">{job?.company || 'Unknown Company'}</div>
                      <div className="text-[11px] text-muted-foreground">{job?.title || 'Job Application'}</div>
                      {app.notes && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground italic">
                          <MessageSquare className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate max-w-xs">{app.notes.split('\n')[0]}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3">
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {ALL_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st.charAt(0).toUpperCase() + st.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-3 text-muted-foreground font-mono text-[11px]">
                      {new Date(app.prefilledAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>

                    <td className="px-5 py-3 text-muted-foreground font-mono text-[11px]">
                      {app.submittedAt
                        ? new Date(app.submittedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : <span className="opacity-40">—</span>}
                    </td>

                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {app.submittedAnswers && Object.keys(app.submittedAnswers).length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSnapshotModalApp({ app, job })}
                            title="View submitted snapshot (Interview prep)"
                            className="h-7 px-2 text-[11px] gap-1 font-normal"
                          >
                            <Eye className="h-3 w-3" />
                            Answers
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setNotesModalApp({ app, job, noteText: '' })}
                          title="Add/View notes"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>

                        {job?.url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          >
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Open job posting URL"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* "What Did I Submit?" Snapshot Modal */}
      <Dialog open={Boolean(snapshotModalApp)} onOpenChange={(open) => !open && setSnapshotModalApp(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{snapshotModalApp?.job?.company || 'Application'} — Submitted Snapshot</DialogTitle>
            <DialogDescription>
              {snapshotModalApp?.job?.title} • Answers saved at submission time for interview prep.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 max-h-[60vh]">
            {Object.entries(snapshotModalApp?.app.submittedAnswers || {}).map(([key, val]) => (
              <div key={key} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                  {key.replace(/[_\\[\\]]/g, ' ')}
                </div>
                <div className="mt-1 text-xs text-foreground font-mono whitespace-pre-wrap leading-relaxed">
                  {val}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSnapshotModalApp(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Modal */}
      <Dialog open={Boolean(notesModalApp)} onOpenChange={(open) => !open && setNotesModalApp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notes: {notesModalApp?.job?.company}</DialogTitle>
            <DialogDescription>
              Record interview dates, contact details, or notes about this role.
            </DialogDescription>
          </DialogHeader>

          {notesModalApp?.app.notes && (
            <div className="p-3 bg-muted/50 rounded-lg border border-border text-xs text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
              {notesModalApp.app.notes}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note-input">Add Note</Label>
            <Textarea
              id="note-input"
              rows={3}
              value={notesModalApp?.noteText || ''}
              onChange={(e) => notesModalApp && setNotesModalApp({ ...notesModalApp, noteText: e.target.value })}
              placeholder="e.g. Recruiter phone screen scheduled for next Tuesday..."
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setNotesModalApp(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveNote}>
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
