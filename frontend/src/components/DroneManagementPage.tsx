import { useState } from 'react';

interface Drone {
  id: string;
  make: string;
  model: string;
  batteryPercent: number;
}

interface DroneManagementPageProps {
  onBack: () => void;
}

export default function DroneManagementPage({ onBack }: DroneManagementPageProps) {
  const [drones, setDrones] = useState<Drone[]>([
    { id: 'DR-001', make: 'DJI', model: 'Mavic 3', batteryPercent: 82 },
    { id: 'DR-002', make: 'Skydio', model: 'X2', batteryPercent: 64 },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openAddModal = () => {
    setNewMake('');
    setNewModel('');
    setError(null);
    setIsModalOpen(true);
  };

  const closeAddModal = () => {
    setIsModalOpen(false);
  };

  const handleCreateDrone = () => {
    if (!newMake.trim() || !newModel.trim()) {
      setError('Please enter both make and model.');
      return;
    }
    const newIdNumeric = drones.length + 1;
    const newDrone: Drone = {
      id: `DR-${String(newIdNumeric).padStart(3, '0')}`,
      make: newMake.trim(),
      model: newModel.trim(),
      batteryPercent: Math.min(100, Math.max(10, Math.round(50 + Math.random() * 50))),
    };
    setDrones(prev => [...prev, newDrone]);
    setIsModalOpen(false);
  };

  return (
    <div className="lp">
      <div className="lp-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="lp-back-btn" onClick={onBack}>Back</button>
        <h1 id="landing-title" style={{ margin: 0 }}>Drone Management</h1>
      </div>

      <div className="lp-panel" style={{ padding: 16 }}>
        {drones.length === 0 ? (
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
                  <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${drone.batteryPercent}%`, height: '100%', background: drone.batteryPercent > 50 ? '#4caf50' : drone.batteryPercent > 20 ? '#ffb300' : '#e53935' }} />
                  </div>
                  <span>{drone.batteryPercent}%</span>
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
                <button className="lp-btn lp-btn--ghost" onClick={closeAddModal}>Cancel</button>
                <button className="lp-btn lp-btn--primary" onClick={handleCreateDrone}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


