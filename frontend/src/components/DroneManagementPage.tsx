import { useState, useEffect } from 'react';

interface Drone {
  id: string;
  make: string;
  model: string;
}

interface DroneManagementPageProps {
  onBack: () => void;
}

export default function DroneManagementPage({ onBack }: DroneManagementPageProps) {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void handleReload();
  }, []);

  const handleReload = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resp = await fetch('http://127.0.0.1:5000/drones');
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const items: Array<{ id: string; make: string; model: string }> = data.items || [];
      setDrones(items.map(d => ({ id: d.id, make: d.make, model: d.model })));
    } catch (e) {
      console.error('Failed to load drones:', e);
      setLoadError('Failed to load drones.');
    } finally {
      setIsLoading(false);
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const openAddModal = () => {
    setNewMake('');
    setNewModel('');
    setError(null);
    setIsModalOpen(true);
  };

  const closeAddModal = () => {
    setIsModalOpen(false);
  };

  const handleCreateDrone = async () => {
    if (!newMake.trim() || !newModel.trim()) {
      setError('Please enter both make and model.');
      return;
    }
    try {
      setIsSubmitting(true);
      const resp = await fetch('http://127.0.0.1:5000/drones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ make: newMake.trim(), model: newModel.trim() })
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`Create failed (${resp.status}) ${txt}`);
      }
      const created: { id: string; make: string; model: string } = await resp.json();
      setDrones(prev => [...prev, { id: created.id, make: created.make, model: created.model }]);
      setIsModalOpen(false);
    } catch (e) {
      console.error('Failed to create drone:', e);
      setError('Failed to create drone. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="lp">
      <div className="lp-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="lp-back-btn" onClick={onBack}>Back</button>
        <h1 id="landing-title" style={{ margin: 0 }}>Drone Management</h1>
      </div>

      <div className="lp-panel" style={{ padding: 16 }}>
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.8 }}>Loading drones...</div>
        ) : loadError ? (
          <div className="lp-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: '#e53935' }}>{loadError}</div>
            <div>
              <button className="lp-btn lp-btn--primary" onClick={handleReload}>Retry</button>
            </div>
          </div>
        ) : drones.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            <button onClick={openAddModal} className="lp-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed #ccc', background: 'transparent' }}>
              + Add New Drone
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {drones.map(drone => (
              <div key={drone.id} className="lp-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{drone.make} {drone.model}</strong>
                  <span style={{ fontFamily: 'monospace' }}>{drone.id}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Battery:</span>
                  <span style={{ opacity: 0.7 }}>—</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="lp-btn lp-btn--ghost" onClick={() => { /* Intentionally unimplemented */ }}>
                    View in Live System
                  </button>
                </div>
              </div>
            ))}
            <button onClick={openAddModal} className="lp-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed #ccc', background: 'transparent' }}>
              + Add New Drone
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-drone-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAddModal();
          }}
        >
          <div className="lp-card" style={{ width: 'min(520px, 92vw)', padding: 20, background: 'white' }} onClick={(e) => e.stopPropagation()}>
            <h2 id="add-drone-title" style={{ marginTop: 0 }}>Add New Drone</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>Make</span>
                <input
                  type="text"
                  value={newMake}
                  onChange={(e) => setNewMake(e.target.value)}
                  placeholder="e.g., DJI, Skydio"
                  style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>Model</span>
                <input
                  type="text"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="e.g., Mavic 3, X2"
                  style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                />
              </label>
              {error && <div style={{ color: '#e53935' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="lp-btn lp-btn--ghost" onClick={closeAddModal} disabled={isSubmitting}>Cancel</button>
                <button className="lp-btn lp-btn--primary" onClick={handleCreateDrone} disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


