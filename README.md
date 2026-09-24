# StreamWeaver — Development Plan

**Project:** High-Throughput No-Code ETL Pipeline
**Focus:** Memory-safe file ingestion (Backend) + Virtualized data preview (Frontend)
**Stack:** Node.js, Express, Busboy/Multer, Streams API · React, react-window/react-virtualized

---

## 🎯 Objective

Lay the foundation of StreamWeaver's core promise — handling massive files (5GB+) without crashing. This means:

- **Backend:** Accept file uploads via true streaming, never buffering the full file into memory.
- **Frontend:** Preview the first 1,000 rows of the uploaded CSV using a virtualized grid, without lagging the DOM.

---

## 🔧 BACKEND — Multipart Streaming

### Backend Problem

Traditional upload middleware buffers the entire file into RAM before processing, which crashes the Node.js V8 heap on large files. Week 1 replaces this with a true streaming pipeline.

### Backend Tasks

- [ ] Set up Express server with a dedicated `/upload` route
- [ ] Integrate **Busboy** (or Multer in streaming mode, not `memoryStorage`/`diskStorage`) to parse `multipart/form-data`
- [ ] Pipe the incoming file stream directly via Node's `stream` module — no `Buffer.concat` or full-file reads
- [ ] Emit upload progress events (bytes received) for the frontend's future live progress bar (Week 3)
- [ ] Add stream-level file-type/size validation (reject non-CSV/JSON early)
- [ ] Test: upload a ~500MB–1GB dummy file and confirm `process.memoryUsage().rss` stays flat

### Backend Constraints

- **Never** use `req.body` parsing for the file — it buffers everything
- **Never** call `fs.readFileSync` or hold the full file in a variable
- All processing must happen in `data` chunk events or via `.pipe()`

### Example Skeleton (Busboy)

```js
const Busboy = require('busboy');

app.post('/upload', (req, res) => {
  const bb = Busboy({ headers: req.headers });

  bb.on('file', (name, fileStream, info) => {
    let bytesReceived = 0;
    fileStream.on('data', (chunk) => {
      bytesReceived += chunk.length;
      // forward chunk to Week 2's transform stream (not yet built)
    });
    fileStream.on('end', () => {
      console.log(`Upload complete: ${bytesReceived} bytes`);
    });
  });

  bb.on('close', () => res.status(200).json({ message: 'Upload streamed successfully' }));
  req.pipe(bb);
});
```

---

## 🎨 FRONTEND — Virtual Grid

### Frontend Problem

Rendering thousands of `<tr>` rows directly into the DOM causes lag or freezes. Virtualization renders only the visible rows, recycling DOM nodes as the user scrolls.

### Frontend Tasks

- [ ] Set up React app shell (if not already scaffolded) with a file upload input
- [ ] Parse a preview (first 1,000 rows) client-side using a lightweight parser (PapaParse in preview mode is fine)
- [ ] Install and configure `react-window` (`FixedSizeList`/`FixedSizeGrid`) or `react-virtualized`
- [ ] Build a `DataGridPreview` component that:
  - Renders sticky column headers
  - Renders only visible rows via windowing
  - Handles variable column widths gracefully
- [ ] Confirm smooth scrolling with ~1,000 rows × 10–20 columns of dummy data
- [ ] Add a basic loading state while the file is being read/parsed

### Frontend Constraints

- Do **not** map 1,000+ rows directly into JSX (`data.map(row => <tr>...)`) — defeats the purpose
- Only viewport rows (+ small buffer) should exist as DOM nodes at any time
- Component should be reusable later for the Mapping UI (Week 2) and Refine & Polish (Week 4)

### Example Skeleton (react-window)

```jsx
import { FixedSizeList as List } from 'react-window';

function DataGridPreview({ rows, columns }) {
  const Row = ({ index, style }) => (
    <div style={style} className="grid-row">
      {columns.map((col) => (
        <span key={col} className="grid-cell">{rows[index][col]}</span>
      ))}
    </div>
  );

  return (
    <List height={500} itemCount={rows.length} itemSize={35} width="100%">
      {Row}
    </List>
  );
}

export default DataGridPreview;
```

---

## 📁 Suggested Project Structure

```text
streamweaver/
├── backend/
│   ├── server.js
│   ├── routes/
│   │   └── upload.route.js
│   ├── middleware/
│   │   └── streamUpload.middleware.js
│   └── utils/
│       └── memoryLogger.js
└── frontend/
    └── src/
        ├── components/
        │   ├── UploadInput.jsx
        │   └── DataGridPreview.jsx
        ├── hooks/
        │   └── useCsvPreview.js
        └── App.jsx
```

---

## ✅ Acceptance Criteria (End of Week 1)

| Area | Criteria |
| ---- | --------- |

| Backend | 1GB+ file uploads without RSS memory spiking beyond a small constant overhead (~50–150MB) |
| Backend | Upload endpoint handles success/failure without buffering the file |
| Frontend | 1,000-row CSV preview renders instantly, no scroll lag |
| Frontend | DOM node count stays low regardless of dataset size (verify in dev tools) |

---

## 🔗 Dependencies for Week 2

- Backend: expose a readable stream (or emit chunks) so Week 2's `stream.Transform` CSV/JSON parser can consume it.
- Frontend: `DataGridPreview` must be reusable for the column-mapping UI with drag/select interactions.
