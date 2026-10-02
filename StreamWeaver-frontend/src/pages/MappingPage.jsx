import { useState } from 'react';
import MappingForm from '../components/MappingForm';

const MappingPage = () => {
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

  const handleSave = () => {
    console.log('Mapping configuration:', mappings);
    alert('Mapping configuration saved!');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Column Mapping</h1>
          <p style={styles.subtitle}>
            Map CSV columns to destination MongoDB fields.
          </p>
        </div>

        <button style={styles.saveButton} onClick={handleSave}>
          Save Mapping
        </button>
      </div>

      <div style={styles.card}>
        <div style={styles.tableHeader}>
          <div>Source CSV Column</div>
          <div>Destination MongoDB Field</div>
          <div>Transform</div>
          <div>Action</div>
        </div>

        <MappingForm
  mappings={mappings}
  onMappingChange={handleMappingChange}
  onAddMapping={addMapping}
  onRemoveMapping={removeMapping}
/>
       
      </div>
    </div>
  );
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

export default MappingPage;
