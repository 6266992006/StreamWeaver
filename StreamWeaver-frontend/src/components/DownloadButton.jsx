import { useState } from 'react';
import { saveBlob } from '../utils/download';
import { describeApiError } from '../utils/apiError';

// A button that fetches a file and saves it, with its own busy + error state.
//   <DownloadButton label="CSV" fetcher={() => downloadDataset(id, 'csv', token)} />
// `fetcher` must resolve to { blob, filename } (see api/exportApi.js).
const DownloadButton = ({ label, title, fetcher, className = 'btn btn-ghost btn-small', onDone }) => {
  // idle | busy | error
  const [state, setState] = useState({ status: 'idle', message: '' });

  const handleClick = async () => {
    setState({ status: 'busy', message: '' });
    try {
      const file = await fetcher();
      saveBlob(file.blob, file.filename);
      setState({ status: 'idle', message: '' });
      onDone?.(file);
    } catch (err) {
      setState({ status: 'error', message: describeApiError(err, 'Download failed.') });
    }
  };

  return (
    <span className="download">
      <button type="button" className={className} onClick={handleClick} disabled={state.status === 'busy'} title={title}>
        {state.status === 'busy' ? 'Preparing…' : label}
      </button>
      {state.status === 'error' && (
        <span className="download-error" role="alert">
          {state.message}
        </span>
      )}
    </span>
  );
};

export default DownloadButton;
