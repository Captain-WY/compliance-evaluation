import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { API_MODE, type MockBoundaryEvent } from '../services/api';

export default function ApiModeBanner() {
  const [latest, setLatest] = useState<MockBoundaryEvent | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      setLatest((event as CustomEvent<MockBoundaryEvent>).detail);
    };
    window.addEventListener('compliance-api-mock-boundary', listener);
    return () => window.removeEventListener('compliance-api-mock-boundary', listener);
  }, []);

  if (API_MODE === 'real' && !latest) return null;

  return (
    <div data-testid="api-mode-banner" className="fixed bottom-4 left-4 z-[1000] max-w-md rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <div className="font-bold">API 模式：{API_MODE}</div>
          <div className="mt-1 text-xs leading-relaxed">
            {latest
              ? `${latest.area}: ${latest.message}`
              : 'hybrid/mock 模式下，未接入 P0 后端的页面会显性提示 mock 边界。'}
          </div>
        </div>
      </div>
    </div>
  );
}
