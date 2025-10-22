import React from 'react';

interface LiveSystemPageProps {
  onBack: () => void;
}

export default function LiveSystemPage({ onBack }: LiveSystemPageProps) {
  return (
    <div className="lp">
      <div className="lp-header">
        <button className="lp-back-btn" onClick={onBack}>
          Back to Welcome
        </button>
      </div>

      <div className="coming-soon-content">
        <div className="coming-soon-icon">
          <div className="drone-symbol">
            <div className="drone-body"></div>
            <div className="drone-prop"></div>
          </div>
        </div>
        
        <h2 className="coming-soon-title">Live System</h2>
        <p className="coming-soon-description">
          Connect to real drone systems for live herding operations. 
          This system will allow you to control and monitor actual drone 
          fleets performing real-world herding missions.
        </p>
        
        <div className="coming-soon-features">
          <div className="feature-item">
            <div className="feature-icon">📡</div>
            <h3>Real-time Control</h3>
            <p>Direct control of drone systems with live telemetry</p>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon">📊</div>
            <h3>Live Monitoring</h3>
            <p>Monitor drone status, battery, and mission progress</p>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon">🎯</div>
            <h3>Mission Planning</h3>
            <p>Plan and execute real herding missions</p>
          </div>
        </div>
        
        <div className="coming-soon-footer">
          <p>Connect to live drone systems for real-world operations!</p>
        </div>
      </div>
    </div>
  );
}
