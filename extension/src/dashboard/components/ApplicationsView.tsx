import React, { useState } from 'react';
import { Application, ApplicationStatus, Job } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Briefcase, Eye, MessageSquare, ExternalLink, Search, ArrowUpDown, X } from 'lucide-react';

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

  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case 'prefilled':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'submitted':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'interviewing':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'offer':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'withdrawn':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'abandoned':
        return 'bg-gray-100 text-gray-500 border-gray-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {['all', 'prefilled', 'submitted', 'interviewing', 'offer', 'rejected'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filterStatus === status
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter company or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs focus:outline-none"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="company">Company Name</option>
            </select>
          </div>
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-3">
            <Briefcase className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No applications found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || filterStatus !== 'all'
              ? 'No applications match your active filters.'
              : 'Open a job application page (Greenhouse) and press Alt+Shift+O. Odos will prefill the form and log it automatically here.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-3">Company & Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Prefilled Date</th>
                <th className="px-5 py-3">Submitted Date</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApps.map((app) => {
                const job = jobsMap.get(app.jobId);
                return (
                  <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{job?.company || 'Unknown Company'}</div>
                      <div className="text-xs text-slate-500">{job?.title || 'Job Application'}</div>
                      {app.notes && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-600 italic">
                          <MessageSquare className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                          <span className="truncate max-w-xs">{app.notes.split('\n')[0]}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none ${getStatusBadge(
                          app.status
                        )}`}
                      >
                        {ALL_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st.charAt(0).toUpperCase() + st.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {new Date(app.prefilledAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {app.submittedAt
                        ? new Date(app.submittedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : <span className="text-slate-400">—</span>}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {app.submittedAnswers && Object.keys(app.submittedAnswers).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSnapshotModalApp({ app, job })}
                            title="View submitted snapshot (Interview prep)"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5 text-indigo-600" />
                            Answers
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setNotesModalApp({ app, job, noteText: '' })}
                          title="Add/View notes"
                          className="rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>

                        {job?.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            title="Open job URL"
                            className="rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
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
      {snapshotModalApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {snapshotModalApp.job?.company} — Submitted Snapshot
                </h3>
                <p className="text-xs text-slate-500">{snapshotModalApp.job?.title} (Interview Prep)</p>
              </div>
              <button
                onClick={() => setSnapshotModalApp(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-3">
              {Object.entries(snapshotModalApp.app.submittedAnswers || {}).map(([key, val]) => (
                <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div className="text-xs font-semibold text-slate-700 capitalize">{key.replace(/[_\\[\\]]/g, ' ')}</div>
                  <div className="mt-1 text-xs text-slate-900 font-mono whitespace-pre-wrap">{val}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setSnapshotModalApp(null)}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesModalApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Application Notes: {notesModalApp.job?.company}
              </h3>
              <button
                onClick={() => setNotesModalApp(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {notesModalApp.app.notes && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {notesModalApp.app.notes}
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">Add Note / Interview Stage Update</label>
              <textarea
                rows={3}
                value={notesModalApp.noteText}
                onChange={(e) => setNotesModalApp({ ...notesModalApp, noteText: e.target.value })}
                placeholder="e.g. Recruiter phone screen scheduled for next Tuesday..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNotesModalApp(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
