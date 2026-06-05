import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { scanDirectory, organizeCases, CaseFolder } from './services/organizer';

const router = Router();

// Validation schema for scanning
const scanSchema = z.object({
  rootPath: z.string().min(1, 'Root path is required'),
});

/**
 * Endpoint to scan a root directory for case folders with 'art' subfolders.
 */
router.post('/api/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { rootPath } = parsed.data;
    const cases = await scanDirectory(rootPath);
    res.json({ cases });
  } catch (error: any) {
    console.error('[API] Scan error:', error);
    res.status(500).json({ error: error.message || 'Failed to scan directory' });
  }
});

/**
 * Server-Sent Events (SSE) endpoint to run organization and stream progress.
 */
router.get('/api/organize', async (req: Request, res: Response): Promise<void> => {
  const { cases: casesJson, outputDir, isTest: isTestStr, sortWithAI: sortWithAIStr } = req.query;

  if (!casesJson || !outputDir) {
    res.status(400).json({ error: 'Missing cases or outputDir parameters' });
    return;
  }

  // Setup SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish the connection immediately

  const sendEvent = (data: { log?: string; progress?: number; completed?: boolean; error?: string }) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const selectedCases: CaseFolder[] = JSON.parse(casesJson as string);
    const isTest = isTestStr === 'true';
    const sortWithAI = sortWithAIStr === 'true';

    sendEvent({ log: `[SYSTEM] Preparing organization task...`, progress: 0 });

    await organizeCases({
      selectedCases,
      outputDir: outputDir as string,
      isTest,
      sortWithAI,
      onLog: (log) => {
        sendEvent({ log, progress: undefined });
      },
      onProgress: (progress) => {
        sendEvent({ progress });
      },
    });

    sendEvent({ log: '[SYSTEM] Task finished successfully.', progress: 100, completed: true });
  } catch (err: any) {
    console.error('[API] Organize error:', err);
    sendEvent({ error: err.message || 'An error occurred during organization', completed: true });
  } finally {
    res.end();
  }
});

export default router;
