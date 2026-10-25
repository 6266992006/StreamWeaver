import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ImportContext = createContext(null);

// Carries the chosen CSV between the three import screens (Upload → Mapping →
// Import). A File can't live in the URL or localStorage, so it's held in
// memory: refreshing the page drops it and you start again from Upload.
//
//   draft  { file, columns, rows (preview), estimatedRows, issues } | null
//   run    { jobId, datasetId } | null   (set once the job has been created)
export const ImportProvider = ({ children }) => {
  const [draft, setDraft] = useState(null);
  const [run, setRun] = useState(null);

  const startDraft = useCallback((next) => {
    setDraft(next);
    setRun(null);
  }, []);
  const clear = useCallback(() => {
    setDraft(null);
    setRun(null);
  }, []);

  const value = useMemo(() => ({ draft, run, startDraft, setRun, clear }), [draft, run, startDraft, clear]);
  return <ImportContext.Provider value={value}>{children}</ImportContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useImport = () => useContext(ImportContext);
