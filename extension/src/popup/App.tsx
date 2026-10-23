import React, { useState, useEffect } from 'react';
import { repository } from '../core/storage/repository';
import { Sparkles, LayoutDashboard, Globe, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Separator } from '../components/ui/separator';

export const App: React.FC = () => {
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [detectedAts, setDetectedAts] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [pageType, setPageType] = useState<'listing' | 'application' | 'unknown'>('unknown');
  const [jobInfo, setJobInfo] = useState<{ title?: string; company?: string } | null>(null);
  const [appCount, setAppCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

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
    setIsRunning(true);
    setStatusMessage(null);
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'RUN_ODOS' }, (response) => {
            setIsRunning(false);
            if (chrome.runtime.lastError) {
              setStatusMessage('Content script not active on this page yet. Refresh and try again.');
            } else if (response?.status) {
              setStatusMessage(response.status);
            }
          });
        } else {
          setIsRunning(false);
        }
      });
    } else {
      setIsRunning(false);
    }
  };

  const hostName = currentUrl ? (() => {
    try {
      return new URL(currentUrl).hostname;
    } catch {
      return currentUrl;
    }
  })() : 'No active page';

  return (
    <div className="w-[320px] bg-background text-foreground p-4 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-zinc-950 text-white flex items-center justify-center font-bold text-xs shadow-sm ring-1 ring-zinc-800">
            O
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-foreground">Odos</span>
              <span className="text-[10px] text-muted-foreground font-mono">v2.0</span>
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0.5">
          {appCount} Applied
        </Badge>
      </div>

      <Separator className="my-2" />

      {/* Main Detection Card */}
      <div className="space-y-3 py-1">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {detectedAts ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-950 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-950"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      {detectedAts}
                    </span>
                  </>
                ) : (
                  <>
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Standard Page</span>
                  </>
                )}
              </div>

              {detectedAts && (
                <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5 font-normal">
                  {Math.round(confidence * 100)}% match
                </Badge>
              )}
            </div>

            {jobInfo?.title ? (
              <div className="border-t border-border/60 pt-1.5">
                <div className="text-xs font-medium text-foreground truncate">
                  {jobInfo.title}
                </div>
                {jobInfo.company && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    {jobInfo.company}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
              <span className="truncate max-w-[170px]" title={hostName}>{hostName}</span>
              <Badge variant="secondary" className="text-[9px] uppercase tracking-wider px-1.5 py-0 h-4 font-mono">
                {pageType}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {statusMessage && (
          <div className="rounded-md border border-border bg-muted/60 p-2.5 text-[11px] text-foreground leading-relaxed flex items-start gap-1.5">
            <Check className="h-3.5 w-3.5 text-foreground flex-shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <Button
            onClick={handleRunOdos}
            disabled={isRunning}
            className="w-full h-9 gap-2 font-medium"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isRunning ? 'Prefilling Form...' : 'Prefill Application'}
          </Button>

          <Button
            variant="outline"
            onClick={handleOpenDashboard}
            className="w-full h-8 text-xs font-normal gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Open Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
