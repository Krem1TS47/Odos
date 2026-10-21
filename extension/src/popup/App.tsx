import React, { useState, useEffect } from 'react';
import { repository } from '../core/storage/repository';
import { Sparkles, CheckCircle, AlertCircle, LayoutDashboard } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [detectedAts, setDetectedAts] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [pageType, setPageType] = useState<'listing' | 'application' | 'unknown'>('unknown');
  const [jobInfo, setJobInfo] = useState<{ title?: string; company?: string } | null>(null);
  const [appCount, setAppCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    // Fetch stats
    repository.listApplications().then((apps) => setAppCount(apps.length));

    // Get current tab & request detection from content script
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.url) {
          setCurrentUrl(tab.url);
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_DETECTION' }, (response) => {
              if (response?.success && response.detection) {
                setDetectedAts(response.detection.ats);
                setConfidence(response.detection.confidence);
                setPageType(response.detection.pageType);
                if (response.detection.jobPosting) {
                  setJobInfo({
                    title: response.detection.jobPosting.title,
                    company: response.detection.jobPosting.company
                  });
                }
              }
            });
          }
        }
      });
    }
  }, []);

  const handleOpenDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../dashboard/index.html', '_blank');
    }
  };

  const handleRunOdos = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'RUN_ODOS' }, (response) => {
            if (chrome.runtime.lastError) {
              setStatusMessage('Content script not active on this page yet.');
            } else if (response?.status) {
              setStatusMessage(response.status);
            }
          });
        }
      });
    }
  };

  return (
    <div className="p-4 bg-white min-w-[300px]">
      <div className="flex items-center justify-between border-b pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            O
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Odos</h1>
            <span className="text-[10px] text-slate-500">Job Application Hub</span>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {appCount} Applied
        </span>
      </div>

      <div className="space-y-3">
        {/* ATS Recognition Card */}
        <div className={`p-3 rounded-xl border text-xs ${
          detectedAts
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center justify-between font-semibold mb-1">
            <div className="flex items-center gap-1.5">
              {detectedAts ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span className="capitalize">{detectedAts} Detected</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <span>Standard Web Page</span>
                </>
              )}
            </div>
            {detectedAts && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-medium">
                {Math.round(confidence * 100)}%
              </span>
            )}
          </div>

          {jobInfo?.title && (
            <div className="font-medium text-slate-800 mt-1 truncate">
              {jobInfo.title} {jobInfo.company ? `at ${jobInfo.company}` : ''}
            </div>
          )}

          <div className="flex items-center justify-between mt-1 text-[11px] opacity-80">
            <span className="truncate max-w-[170px]">{currentUrl ? new URL(currentUrl).hostname : 'No active page'}</span>
            <span className="uppercase text-[9px] font-bold tracking-wider px-1 rounded bg-slate-200/60 text-slate-700">
              {pageType}
            </span>
          </div>
        </div>

        {statusMessage && (
          <div className="p-2 rounded bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-700">
            {statusMessage}
          </div>
        )}

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleRunOdos}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          Run Odos Prefill (Alt+Shift+O)
        </button>

        {/* Dashboard Link */}
        <button
          type="button"
          onClick={handleOpenDashboard}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <LayoutDashboard className="h-3.5 w-3.5 text-slate-500" />
          Open Full Dashboard
        </button>
      </div>
    </div>
  );
};
