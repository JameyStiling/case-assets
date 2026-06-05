export interface CaseFolder {
  path: string;
  name: string;
  artFolderPath: string;
  fileCount: number;
  fileTypes: Record<string, number>;
  totalSizeMb: number;
}

export interface OrganizeEvent {
  log?: string;
  progress?: number;
  completed?: boolean;
  error?: string;
}

const API_BASE_URL = 'http://localhost:3001';

/**
 * Sends a request to scan the root directory.
 */
export async function scanRootDirectory(rootPath: string): Promise<CaseFolder[]> {
  const response = await fetch(`${API_BASE_URL}/api/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rootPath }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server returned error ${response.status}`);
  }

  const data = await response.json();
  return data.cases || [];
}

/**
 * Establishes a Server-Sent Events stream to organize selected case folders.
 * Returns an EventSource object that can be closed to abort.
 */
export function streamOrganizeCases({
  cases,
  outputDir,
  isTest,
  sortWithAI,
  onEvent,
}: {
  cases: CaseFolder[];
  outputDir: string;
  isTest: boolean;
  sortWithAI: boolean;
  onEvent: (event: OrganizeEvent) => void;
}): EventSource {
  const url = new URL(`${API_BASE_URL}/api/organize`);
  url.searchParams.append('cases', JSON.stringify(cases));
  url.searchParams.append('outputDir', outputDir);
  url.searchParams.append('isTest', String(isTest));
  url.searchParams.append('sortWithAI', String(sortWithAI));

  const eventSource = new EventSource(url.toString());

  eventSource.onmessage = (event) => {
    try {
      const data: OrganizeEvent = JSON.parse(event.data);
      onEvent(data);
      if (data.completed) {
        eventSource.close();
      }
    } catch (err) {
      console.error('Failed to parse SSE event data', err);
    }
  };

  eventSource.onerror = (err) => {
    console.error('SSE Connection error:', err);
    onEvent({
      error: 'Lost connection to background process.',
      completed: true,
    });
    eventSource.close();
  };

  return eventSource;
}
