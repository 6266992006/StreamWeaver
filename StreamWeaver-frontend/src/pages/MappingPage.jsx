import { useState } from 'react';
import MappingForm from '../components/MappingForm';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const MappingPage = () => {
  const { token } = useAuth();
  const [mappings, setMappings] = useState([
    {
      source: 'first_name',
      destination: 'name',
      transform: 'None',
    },
    {
      source: 'email',
      destination: 'email',
      transform: 'None',
    },
    {
      source: 'phone',
      destination: 'mobile',
      transform: 'None',
    },
  ]);

  const handleMappingChange = (index, field, value) => {
    const updatedMappings = [...mappings];

    updatedMappings[index] = {
      ...updatedMappings[index],
      [field]: value,
    };

    setMappings(updatedMappings);
  };

  const addMapping = () => {
    setMappings([
      ...mappings,
      {
        source: '',
        destination: '',
        transform: 'None',
      },
    ]);
  };

  const removeMapping = (index) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
  try {
    const mapping = {};

    mappings.forEach((item) => {
      if (item.source.trim() && item.destination.trim()) {
        mapping[item.source] = item.destination;
      }
    });

    const response = await axios.post(
      'http://localhost:5000/api/mapping',
      { mapping },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log('Mapping saved:', response.data);
    alert('Mapping configuration saved!');
  } catch (error) {
    console.error('Error saving mapping:', error);
    alert(
      error.response?.data?.message || 'Failed to save mapping'
    );
  }
};
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1100px',
    margin: '0 auto',
    fontFamily: 'Arial, sans-serif',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  },

  title: {
    margin: 0,
    fontSize: '28px',
  },

  subtitle: {
    color: '#666',
    marginTop: '8px',
  },

  saveButton: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  card: {
    border: '1px solid #ddd',
    borderRadius: '10px',
    padding: '20px',
    backgroundColor: '#fff',
  },

  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 100px',
    gap: '12px',
    fontWeight: 'bold',
    paddingBottom: '12px',
    borderBottom: '1px solid #ddd',
  },

  mappingRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 100px',
    gap: '12px',
    alignItems: 'center',
    padding: '15px 0',
    borderBottom: '1px solid #eee',
  },

  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    boxSizing: 'border-box',
  },

  select: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    backgroundColor: '#fff',
  },

  removeButton: {
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    padding: '9px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  addButton: {
    marginTop: '20px',
    padding: '10px 16px',
    border: '1px solid #2563eb',
    backgroundColor: '#fff',
    color: '#2563eb',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
return (
  <div style={styles.container}>
    <div style={styles.header}>
      <div>
        <h1 style={styles.title}>Column Mapping</h1>
        <p style={styles.subtitle}>
          Map source columns to destination fields
        </p>
      </div>

      <button style={styles.saveButton} onClick={handleSave}>
        Save Mapping
      </button>
    </div>

    <div style={styles.card}>
      <div style={styles.tableHeader}>
        <div>Source Column</div>
        <div>Destination Field</div>
        <div>Transform</div>
        <div>Action</div>
      </div>

      {mappings.map((mapping, index) => (
        <div style={styles.mappingRow} key={index}>
          <input
            type="text"
            value={mapping.source}
            onChange={(e) =>
              handleMappingChange(index, 'source', e.target.value)
            }
            placeholder="Source column"
            style={styles.input}
          />

          <input
            type="text"
            value={mapping.destination}
            onChange={(e) =>
              handleMappingChange(index, 'destination', e.target.value)
            }
            placeholder="Destination field"
            style={styles.input}
          />

          <select
            value={mapping.transform}
            onChange={(e) =>
              handleMappingChange(index, 'transform', e.target.value)
            }
            style={styles.select}
          >
            <option value="None">None</option>
            <option value="Uppercase">Uppercase</option>
            <option value="Lowercase">Lowercase</option>
            <option value="Trim">Trim</option>
          </select>

          <button
            style={styles.removeButton}
            onClick={() => removeMapping(index)}
          >
            Remove
          </button>
        </div>
      ))}

      <button style={styles.addButton} onClick={addMapping}>
        + Add Column
      </button>
    </div>
  </div>
);
};

export default MappingPage;