import React, { useState, useEffect } from 'react';
import { Application, ApplicationStatus, Job, ApplicationAudit } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Briefcase, Eye, MessageSquare, ExternalLink, Search, ArrowUpDown, ShieldCheck, Plus, Trash2, Link2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
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
  const [activeSubView, setActiveSubView] = useState<'applications' | 'audit_log'>('applications');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'company'>('date_desc');
  const [snapshotModalApp, setSnapshotModalApp] = useState<{ app: Application; job?: Job } | null>(null);
  const [notesModalApp, setNotesModalApp] = useState<{ app: Application; job?: Job; noteText: string } | null>(null);

  // Auditing state
  const [audits, setAudits] = useState<ApplicationAudit[]>([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [isAddAuditModalOpen, setIsAddAuditModalOpen] = useState(false);
  const [newAuditUrl, setNewAuditUrl] = useState('');
  const [newAuditCompany, setNewAuditCompany] = useState('');
  const [newAuditTitle, setNewAuditTitle] = useState('');
  const [newAuditNotes, setNewAuditNotes] = useState('');

  const loadAudits = async () => {
    try {
      const list = await repository.listApplicationAudits();
      setAudits(list);
    } catch (err) {
      console.warn('[Odos] Could not load application audits:', err);
    }
  };

  useEffect(() => {
    loadAudits();
  }, [applications]);

  const jobsMap = new Map(jobs.map((j) => [j.id, j]));

  // Applications Filtering
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

  // Applications Sorting
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

  // Audit Log Filtering
  const filteredAudits = audits.filter((audit) => {
    if (!auditSearchQuery.trim()) return true;
    const q = auditSearchQuery.toLowerCase();
    return (
      audit.company.toLowerCase().includes(q) ||
      audit.title.toLowerCase().includes(q) ||
      audit.url.toLowerCase().includes(q)
    );
  });

  const handleStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    try {
      await repository.updateApplicationStatus(appId, newStatus);
      onUpdate();
      loadAudits();
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

  const handleAddManualAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuditUrl.trim() || !newAuditCompany.trim() || !newAuditTitle.trim()) {
      alert('Please fill in Company, Job Title, and Link URL.');
      return;
    }
    try {
      await repository.recordApplicationAudit({
        url: newAuditUrl.trim(),
        company: newAuditCompany.trim(),
        title: newAuditTitle.trim(),
        notes: newAuditNotes.trim(),
        source: 'manual',
        appliedAt: new Date().toISOString()
      });
      setNewAuditUrl('');
      setNewAuditCompany('');
      setNewAuditTitle('');
      setNewAuditNotes('');
      setIsAddAuditModalOpen(false);
      loadAudits();
      onUpdate();
    } catch (err: any) {
      alert('Failed to record audit link: ' + err.message);
    }
  };

  const handleDeleteAudit = async (auditId: string) => {
    if (!confirm('Remove this link from the applied audit log? Duplicate protection will no longer block applications to this link.')) {
      return;
    }
    try {
      await repository.deleteApplicationAudit(auditId);
      loadAudits();
    } catch (err: any) {
      alert('Failed to delete audit: ' + err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-view Switcher */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeSubView === 'applications' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubView('applications')}
            className="text-xs gap-1.5 font-medium"
          >
            <Briefcase className="h-3.5 w-3.5" />
            Applications
            <Badge variant={activeSubView === 'applications' ? 'secondary' : 'outline'} className="ml-1 text-[10px] py-0 px-1 font-mono">
              {applications.length}
            </Badge>
          </Button>

          <Button
            type="button"
            variant={activeSubView === 'audit_log' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubView('audit_log')}
            className="text-xs gap-1.5 font-medium"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Applied Links Audit Log
            <Badge variant={activeSubView === 'audit_log' ? 'secondary' : 'outline'} className="ml-1 text-[10px] py-0 px-1 font-mono">
              {audits.length}
            </Badge>
          </Button>
        </div>

        {activeSubView === 'audit_log' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAddAuditModalOpen(true)}
            className="text-xs gap-1.5 font-normal h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Applied Link
          </Button>
        )}
      </div>

      {activeSubView === 'audit_log' ? (
        /* AUDITED APPLIED LINKS VIEW */
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center justify-between gap-4">
            <div>
              <strong className="text-foreground">Application Audit & Duplicate Protection:</strong> Every role you submit via Odos is logged below with its posting link. Odos checks this log before filling to protect you from applying to roles you have already applied to.
            </div>
            <div className="text-[11px] font-mono shrink-0">
              {audits.length} link{audits.length === 1 ? '' : 's'} tracked
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search applied links, company, role..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          {filteredAudits.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground mb-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No applied links audited yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {auditSearchQuery
                  ? 'No applied links match your search.'
                  : 'Starting now, submitted applications will be automatically audited here to prevent duplicate applications. You can also manually add links you have applied to.'}
              </p>
              {!auditSearchQuery && (
                <div className="mt-4">
                  <Button size="sm" variant="outline" onClick={() => setIsAddAuditModalOpen(true)} className="text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Applied Link Manually
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border text-left text-xs">
                <thead className="bg-muted/40 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Company & Role</th>
                    <th className="px-5 py-3 font-medium">Applied Link</th>
                    <th className="px-5 py-3 font-medium">Date Applied</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredAudits.map((item) => {
                    let displayHost = '';
                    try {
                      displayHost = new URL(item.url).hostname;
                    } catch {
                      displayHost = item.url;
                    }

                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">{item.company}</div>
                          <div className="text-[11px] text-muted-foreground">{item.title}</div>
                          {item.notes && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground italic truncate max-w-xs">
                              {item.notes}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 max-w-xs">
                            <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-mono text-foreground hover:underline truncate"
                              title={item.url}
                            >
                              {displayHost}
                            </a>
                          </div>
                        </td>

                        <td className="px-5 py-3 text-muted-foreground font-mono text-[11px]">
                          {new Date(item.appliedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>

                        <td className="px-5 py-3">
                          <Badge variant="outline" className="capitalize text-[10px] font-mono py-0 h-4 px-1.5">
                            {item.source}
                          </Badge>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            >
                              <a href={item.url} target="_blank" rel="noreferrer" title="Open Job URL">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteAudit(item.id)}
                              title="Delete from Audit Log (Remove duplicate protection)"
                              className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* APPLICATIONS TABLE VIEW */
        <>
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
                    const isSubmitted = app.status === 'submitted';

                    return (
                      <tr key={app.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{job?.company || 'Unknown Company'}</span>
                            {isSubmitted && (
                              <span title="Audited & Protected against duplicate applications" className="text-emerald-600 text-[11px] flex items-center gap-0.5">
                                <ShieldCheck className="h-3 w-3" />
                              </span>
                            )}
                          </div>
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
        </>
      )}

      {/* Manual Add Applied Link Modal */}
      <Dialog open={isAddAuditModalOpen} onOpenChange={setIsAddAuditModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleAddManualAudit}>
            <DialogHeader>
              <DialogTitle>Audit Applied Link</DialogTitle>
              <DialogDescription>
                Record a job link you already applied to. Odos will audit it and protect you from applying to it again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="space-y-1">
                <Label htmlFor="audit-company" className="text-xs">Company</Label>
                <Input
                  id="audit-company"
                  placeholder="e.g. Stripe"
                  value={newAuditCompany}
                  onChange={(e) => setNewAuditCompany(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="audit-title" className="text-xs">Job Title / Role</Label>
                <Input
                  id="audit-title"
                  placeholder="e.g. Senior Software Engineer"
                  value={newAuditTitle}
                  onChange={(e) => setNewAuditTitle(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="audit-url" className="text-xs">Job Posting or Application Link</Label>
                <Input
                  id="audit-url"
                  placeholder="https://jobs.lever.co/stripe/..."
                  value={newAuditUrl}
                  onChange={(e) => setNewAuditUrl(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="audit-notes" className="text-xs">Notes (optional)</Label>
                <Textarea
                  id="audit-notes"
                  placeholder="e.g. Applied directly on company career site"
                  value={newAuditNotes}
                  onChange={(e) => setNewAuditNotes(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddAuditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Add to Audit Log
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
