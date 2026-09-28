import { FixedSizeList as List } from 'react-window';

// Virtualized preview grid — only the rows actually visible on screen
// get rendered to the DOM, so previewing 1,000 rows costs about the
// same as rendering 15-20.
const ROW_HEIGHT = 34;
const VISIBLE_HEIGHT = 420;

const VirtualGrid = ({ columns = [], rows = [] }) => {
  if (columns.length === 0) {
    return <p className="virtual-grid-empty">No data to preview yet.</p>;
  }

  const gridTemplateColumns = `repeat(${columns.length}, minmax(140px, 1fr))`;

  const Row = ({ index, style }) => {
    const row = rows[index];
    return (
      <div className="grid-row" style={{ ...style, gridTemplateColumns }}>
        {columns.map((col) => (
          <div key={col} className="grid-cell" title={row[col]}>
            {row[col]}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="virtual-grid">
      <div className="grid-header" style={{ gridTemplateColumns }}>
        {columns.map((col) => (
          <div key={col} className="grid-cell grid-header-cell">
            {col}
          </div>
        ))}
      </div>

      <List height={VISIBLE_HEIGHT} itemCount={rows.length} itemSize={ROW_HEIGHT} width="100%">
        {Row}
      </List>
    </div>
  );
};

export default VirtualGrid;
