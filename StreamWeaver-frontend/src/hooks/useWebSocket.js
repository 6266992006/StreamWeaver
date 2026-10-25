import { useEffect, useState } from 'react';
import { API_BASE } from '../api/config';
import { toWsUrl } from '../utils/wsUrl';

const HEARTBEAT_MS = 25000;
const MAX_RETRIES = 8;

// Live progress for one import job over the backend's WebSocket
// (ws://.../ws/progress). Protocol: connect with ?token=<JWT>, send
// { type: 'subscribe', jobId }, receive { type: 'progress', ... } frames.
//
//   const { frame, connection } = useWebSocket({ jobId, token });
//
// frame       latest progress frame: { status, totalRows, rowsProcessed,
//             rowsFailed, rowsPerSec, percent, ... } or null
// connection  'idle' | 'connecting' | 'open' | 'reconnecting' | 'failed' | 'closed'
//
// Drops are retried with a growing delay (1s, 2s, 4s … max 10s) and the job is
// re-subscribed each time, so a flaky connection or a backend restart doesn't
// leave the progress bar frozen. Once the job is done/failed the socket closes.
export default function useWebSocket({ jobId, token, enabled = true }) {
  const [frame, setFrame] = useState(null);
  const [connection, setConnection] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !jobId || !token) return undefined;

    let socket = null;
    let retries = 0;
    let retryTimer = null;
    let heartbeat = null;
    let stopped = false; // we closed it on purpose (unmount / finished)

    const finish = (state) => {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(retryTimer);
      setConnection(state);
    };

    const connect = () => {
      setConnection(retries === 0 ? 'connecting' : 'reconnecting');
      socket = new WebSocket(toWsUrl(API_BASE, token));

      socket.onopen = () => {
        retries = 0;
        setConnection('open');
        setError('');
        socket.send(JSON.stringify({ type: 'subscribe', jobId }));
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
        }, HEARTBEAT_MS);
      };

      socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'progress' && msg.jobId === jobId) {
          setFrame(msg);
          if (msg.status === 'done' || msg.status === 'failed') {
            finish('closed');
            socket.close();
          }
        } else if (msg.type === 'error') {
          setError(msg.message || 'Live progress error');
        }
      };

      socket.onclose = () => {
        clearInterval(heartbeat);
        if (stopped) return;
        retries += 1;
        if (retries > MAX_RETRIES) {
          finish('failed');
          return;
        }
        setConnection('reconnecting');
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** (retries - 1), 10000));
      };

      // onclose always follows an error, which is where retrying happens.
      socket.onerror = () => {};
    };

    connect();

    return () => {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(retryTimer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [jobId, token, enabled]);

  return { frame, connection, error };
}
