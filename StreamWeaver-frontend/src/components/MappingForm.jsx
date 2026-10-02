const MappingForm = ({
  mappings,
  onMappingChange,
  onAddMapping,
  onRemoveMapping,
}) => {
  return (
    <div>
      {mappings.map((mapping, index) => (
        <div
          key={index}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 100px',
            gap: '12px',
            alignItems: 'center',
            padding: '15px 0',
            borderBottom: '1px solid #eee',
          }}
        >
          <input
            type="text"
            placeholder="CSV column"
            value={mapping.source}
            onChange={(e) =>
              onMappingChange(index, 'source', e.target.value)
            }
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              boxSizing: 'border-box',
            }}
          />

          <input
            type="text"
            placeholder="MongoDB field"
            value={mapping.destination}
            onChange={(e) =>
              onMappingChange(index, 'destination', e.target.value)
            }
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              boxSizing: 'border-box',
            }}
          />

          <select
            value={mapping.transform}
            onChange={(e) =>
              onMappingChange(index, 'transform', e.target.value)
            }
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              backgroundColor: '#fff',
            }}
          >
            <option value="None">None</option>
            <option value="Trim">Trim</option>
            <option value="Uppercase">Uppercase</option>
            <option value="Lowercase">Lowercase</option>
          </select>

          <button
            type="button"
            onClick={() => onRemoveMapping(index)}
            style={{
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              padding: '9px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onAddMapping}
        style={{
          marginTop: '20px',
          padding: '10px 16px',
          border: '1px solid #2563eb',
          backgroundColor: '#fff',
          color: '#2563eb',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        + Add Mapping
      </button>
    </div>
  );
};

export default MappingForm;