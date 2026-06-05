export const PREVIEWABLE_EXTENSIONS = ['.psd', '.ai', '.emf', '.wmf'] as const;

export type PreviewableExtension = (typeof PREVIEWABLE_EXTENSIONS)[number];

export function isPreviewable(ext: string): boolean {
  return PREVIEWABLE_EXTENSIONS.includes(ext.toLowerCase() as PreviewableExtension);
}

/** Whether preview generation is expected to succeed on the current platform. */
export function shouldRequirePreview(ext: string): boolean {
  const normalized = ext.toLowerCase();
  if (normalized === '.psd' || normalized === '.ai') {
    return process.platform === 'darwin';
  }
  if (normalized === '.emf' || normalized === '.wmf') {
    return process.platform === 'win32';
  }
  return false;
}
