import { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  Search, 
  Play, 
  CheckSquare, 
  Terminal, 
  AlertCircle, 
  Loader2, 
  FolderInput
} from 'lucide-react';
import { scanRootDirectory, streamOrganizeCases } from './services/apiClient';
import type { 
  CaseFolder, 
  OrganizeEvent 
} from './services/apiClient';

declare global {
  interface Window {
    electronAPI?: {
      selectDirectory: () => Promise<string | null>;
    };
  }
}

export default function App() {
  const [rootPath, setRootPath] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [isTest, setIsTest] = useState(true);
  const [sortWithAI, setSortWithAI] = useState(false);
  
  const [cases, setCases] = useState<CaseFolder[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  
  const [isScanning, setIsScanning] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [error, setError] = useState<string | null>(null);
  const [userEditedOutput, setUserEditedOutput] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-generate output folder based on rootPath and test toggle
  useEffect(() => {
    if (rootPath && !userEditedOutput) {
      const isUrl = rootPath.startsWith('http://') || rootPath.startsWith('https://');
      const folderName = 'ART TEMP';
      
      if (isUrl) {
        setOutputDir(`/Users/absherd/Downloads/${folderName}`);
      } else {
        const separator = '/';
        const cleanRoot = rootPath.endsWith(separator) ? rootPath.slice(0, -1) : rootPath;
        setOutputDir(`${cleanRoot}${separator}${folderName}`);
      }
    }
  }, [rootPath, isTest, userEditedOutput]);

  // Scroll console to bottom on new log line
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Clean up SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleBrowseSource = async () => {
    if (window.electronAPI) {
      const selectedPath = await window.electronAPI.selectDirectory();
      if (selectedPath) {
        setRootPath(selectedPath);
        setUserEditedOutput(false);
      }
    }
  };

  const handleBrowseOutput = async () => {
    if (window.electronAPI) {
      const selectedPath = await window.electronAPI.selectDirectory();
      if (selectedPath) {
        setOutputDir(selectedPath);
        setUserEditedOutput(true);
      }
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPath = rootPath.trim();
    if (!cleanPath) return;

    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      if (!cleanPath.includes('dropbox.com')) {
        const msg = 'Only dropbox.com shared links are supported for online downloads.';
        setError(msg);
        setLogs([`[ERROR] Scan blocked: ${msg}`]);
        return;
      }
      setLogs([`[SYSTEM] Connecting to Dropbox, downloading and extracting shared folder. Please wait, this may take a moment...`]);
    } else {
      setLogs([`[SYSTEM] Scanning local directory: "${cleanPath}"`]);
    }

    setIsScanning(true);
    setError(null);
    setCases([]);
    setSelectedPaths(new Set());

    try {
      const scannedCases = await scanRootDirectory(cleanPath);
      setCases(scannedCases);
      // Select all by default
      setSelectedPaths(new Set(scannedCases.map(c => c.path)));
      
      if (scannedCases.length === 0) {
        setLogs([`[SYSTEM] Scan completed: No case folders with 'art' subdirectories found in "${rootPath}"`]);
      } else {
        setLogs([`[SYSTEM] Scan completed: Found ${scannedCases.length} case folders.`]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan directory');
      setLogs([`[ERROR] Scan failed: ${err.message || 'Unknown error'}`]);
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleSelect = (path: string) => {
    const nextSelected = new Set(selectedPaths);
    if (nextSelected.has(path)) {
      nextSelected.delete(path);
    } else {
      nextSelected.add(path);
    }
    setSelectedPaths(nextSelected);
  };

  const handleToggleSelectAll = () => {
    if (selectedPaths.size === cases.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(cases.map(c => c.path)));
    }
  };

  const handleStartOrganizing = () => {
    if (selectedPaths.size === 0 || !outputDir.trim() || isOrganizing) return;

    setIsOrganizing(true);
    setProgress(0);
    setLogs([`[SYSTEM] Starting organization task...`]);
    setError(null);

    const selectedCases = cases.filter(c => selectedPaths.has(c.path));

    // Open connection
    const source = streamOrganizeCases({
      cases: selectedCases,
      outputDir: outputDir.trim(),
      isTest,
      sortWithAI,
      onEvent: (event: OrganizeEvent) => {
        if (event.log) {
          setLogs(prev => [...prev, event.log!]);
        }
        if (event.progress !== undefined) {
          setProgress(event.progress);
        }
        if (event.error) {
          setError(event.error);
          setLogs(prev => [...prev, `[ERROR] ${event.error}`]);
          setIsOrganizing(false);
        }
        if (event.completed) {
          setIsOrganizing(false);
          eventSourceRef.current = null;
        }
      }
    });

    eventSourceRef.current = source;
  };

  const handleCancelOrganizing = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsOrganizing(false);
      setLogs(prev => [...prev, `[SYSTEM] Task cancelled by user.`]);
    }
  };

  const getLogClassName = (line: string) => {
    if (line.startsWith('[ERROR]')) return 'console-line error';
    if (line.startsWith('[COMPLETE]')) return 'console-line complete';
    if (line.startsWith('[COPY]')) return 'console-line copy';
    if (line.startsWith('[PREVIEW]')) return 'console-line preview';
    if (line.startsWith('[EMF]')) return 'console-line preview';
    if (line.startsWith('[COLLISION]')) return 'console-line collision';
    if (line.startsWith('[WARNING]')) return 'console-line warning';
    if (line.startsWith('[AI]')) return 'console-line preview';
    return 'console-line system';
  };

  // Helper to count files in selection
  const selectedCasesData = cases.filter(c => selectedPaths.has(c.path));
  const selectedFilesCount = selectedCasesData.reduce((acc, c) => acc + c.fileCount, 0);
  const selectedTotalSize = selectedCasesData.reduce((acc, c) => acc + c.totalSizeMb, 0);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <FolderOpen size={24} />
          </div>
          <div>
            <h1>Case Art Organizer</h1>
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
              Secure local asset aggregator & thumbnail renderer
            </p>
          </div>
          <span>v1.0.0</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => {
              setRootPath('/Users/absherd/Documents/code/caseartorg/mock_dropbox');
              setUserEditedOutput(false);
            }}
          >
            Load Demo Path
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        
        {/* Left Control Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Scan Section */}
          <div className="glass-card">
            <h2 className="card-title">
              <FolderInput size={20} className="logo-icon-color" style={{ color: 'hsl(var(--color-primary))' }} />
              Directory Settings
            </h2>
            <form onSubmit={handleScan}>
              <div className="form-group">
                <label className="form-label" htmlFor="dropbox-path">Dropbox or Case Source Folder</label>
                <div className="input-container">
                  {window.electronAPI && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon"
                      onClick={handleBrowseSource}
                      disabled={isScanning || isOrganizing}
                      title="Browse Folder"
                      style={{ marginRight: '0.25rem' }}
                    >
                      <Folder size={18} />
                    </button>
                  )}
                  <input
                    id="dropbox-path"
                    type="text"
                    className="text-input"
                    placeholder="Local path (e.g. /Users/name/Dropbox) OR Dropbox shared folder URL"
                    value={rootPath}
                    onChange={(e) => {
                      setRootPath(e.target.value);
                      setUserEditedOutput(false);
                    }}
                    disabled={isOrganizing}
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-icon" 
                    disabled={isScanning || isOrganizing || !rootPath.trim()}
                    title="Scan Directory"
                  >
                    {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="output-path">Destination Folder (ART TEMP)</label>
                <div className="input-container">
                  {window.electronAPI && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon"
                      onClick={handleBrowseOutput}
                      disabled={isOrganizing}
                      title="Browse Folder"
                      style={{ marginRight: '0.25rem' }}
                    >
                      <Folder size={18} />
                    </button>
                  )}
                  <input
                    id="output-path"
                    type="text"
                    className="text-input"
                    placeholder="/Users/username/Dropbox/Project/ART TEMP"
                    value={outputDir}
                    onChange={(e) => {
                      setOutputDir(e.target.value);
                      setUserEditedOutput(true);
                    }}
                    disabled={isOrganizing}
                  />
                </div>
              </div>
            </form>
          </div>

          {/* Configuration Options */}
          <div className="glass-card">
            <h2 className="card-title">
              <Play size={20} style={{ color: 'hsl(var(--color-secondary))' }} />
              Run Configuration
            </h2>
            
            {/* Test Toggle Banner */}
            <div className="toggle-option">
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Safe Test Run</div>
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                  Copies max 2 files per file type per case to verify previews
                </div>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isTest} 
                  onChange={(e) => setIsTest(e.target.checked)}
                  disabled={isOrganizing}
                />
                <span className="slider"></span>
              </label>
            </div>

            {/* AI Sorting Toggle */}
            <div className="toggle-option" style={{ marginTop: '0.75rem', borderTop: '1px solid hsl(var(--border-color))', paddingTop: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Sort Assets with AI</div>
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                  Classifies images/previews into categorized subfolders
                </div>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={sortWithAI} 
                  onChange={(e) => setSortWithAI(e.target.checked)}
                  disabled={isOrganizing}
                />
                <span className="slider"></span>
              </label>
            </div>

            {isTest && (
              <div className="alert-banner">
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Test Mode Active:</strong> Limits copy operations to a maximum of 2 files per file type per case to verify paths and previews safely inside your output folder.
                </span>
              </div>
            )}

            {/* Run Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              {!isOrganizing ? (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleStartOrganizing}
                  disabled={selectedPaths.size === 0 || !outputDir.trim() || isScanning}
                >
                  <Play size={18} />
                  {isTest ? 'Execute Test Run' : 'Execute Full Copy'}
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={handleCancelOrganizing}
                >
                  <Loader2 size={18} className="animate-spin" />
                  Cancel Operation
                </button>
              )}
            </div>

            {/* Selection stats */}
            {selectedPaths.size > 0 && (
              <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', borderTop: '1px solid hsl(var(--border-color))', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Selected Cases:</span>
                  <strong style={{ color: 'hsl(var(--text-primary))' }}>{selectedPaths.size} of {cases.length}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Total files in queue:</span>
                  <strong style={{ color: 'hsl(var(--text-primary))' }}>
                    {isTest ? `Capped (2 per file type)` : selectedFilesCount}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Size footprint:</span>
                  <strong style={{ color: 'hsl(var(--text-primary))' }}>~{selectedTotalSize.toFixed(2)} MB</strong>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Dashboard Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0 }}>
          
          {/* Cases Checklist Card */}
          <div className="glass-card" style={{ flex: 1 }}>
            <div className="cases-list-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>
                <Folder size={20} style={{ color: 'hsl(var(--color-primary))' }} />
                Case Folders checklist
              </h2>
              {cases.length > 0 && (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={handleToggleSelectAll}
                  disabled={isOrganizing}
                >
                  {selectedPaths.size === cases.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {cases.length === 0 ? (
              <div className="empty-state">
                <Folder size={48} className="empty-state-icon" />
                <p>No case directories loaded. Input a source path above and scan.</p>
              </div>
            ) : (
              <div className="cases-container">
                {cases.map((caseFolder) => {
                  const isSelected = selectedPaths.has(caseFolder.path);
                  return (
                    <div 
                      key={caseFolder.path}
                      className={`case-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => !isOrganizing && handleToggleSelect(caseFolder.path)}
                      style={{ pointerEvents: isOrganizing ? 'none' : 'auto', opacity: isOrganizing && !isSelected ? 0.5 : 1 }}
                    >
                      <div className="checkbox-container">
                        <div className="custom-checkbox">
                          {isSelected && <CheckSquare size={16} fill="hsl(var(--color-primary))" />}
                        </div>
                      </div>
                      <div className="case-details">
                        <div className="case-name">{caseFolder.name}</div>
                        <div className="case-meta">
                          <span>Files: {caseFolder.fileCount}</span>
                          <span>•</span>
                          <span>Size: {caseFolder.totalSizeMb} MB</span>
                          <span>•</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            {caseFolder.path}
                          </span>
                        </div>
                        {/* File extension tags */}
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          {Object.entries(caseFolder.fileTypes).map(([ext, count]) => {
                            let extClass = '';
                            if (ext === '.psd') extClass = 'psd';
                            if (ext === '.ai') extClass = 'ai';
                            if (ext === '.emf' || ext === '.wmf') extClass = 'emf';
                            return (
                              <span key={ext} className={`badge-tag ${extClass}`}>
                                {ext}: {count}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Real-time Logs Console Card */}
          <div className="glass-card console-card">
            <div className="console-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>
                <Terminal size={20} style={{ color: 'hsl(var(--color-secondary))' }} />
                Real-time logs & operations console
              </h2>
              <div className="console-status">
                <div className={`status-dot ${isOrganizing ? 'active' : error ? 'error' : ''}`}></div>
                <span>{isOrganizing ? 'Processing assets...' : error ? 'Failed' : 'Idle'}</span>
              </div>
            </div>

            <div className="console-body">
              {logs.length === 0 ? (
                <div style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>
                  System ready. Run a directory scan or organization operation to see logs...
                </div>
              ) : (
                logs.map((logLine, idx) => (
                  <div key={idx} className={getLogClassName(logLine)}>
                    {logLine}
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>

            {/* Progress Bar */}
            {(isOrganizing || progress > 0) && (
              <div className="progress-section">
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="progress-text">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
