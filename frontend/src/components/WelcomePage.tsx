import { useState } from "react";
import "./LandingPage.css";

interface WelcomePageProps {
  onNavigateToSimulator: () => void;
  onNavigateToRealSystem: () => void;
}

export default function WelcomePage({ onNavigateToSimulator, onNavigateToRealSystem }: WelcomePageProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  return (
    <div className={`lp ${isTransitioning ? 'transitioning' : ''}`}>
      <h1 id="landing-title">The Drone Rangers</h1>
      <p id="landing-subtitle">Advanced Autonomous Herding Solutions</p>

      <div className="lp-grid">
        {/* Simulator Option */}
        <div className="lp-cards">
          <div 
            className={`choice-option lp-card welcome-card ${selectedCard === 'simulator' ? "selected" : ""}`}
            onClick={() => {
              setSelectedCard('simulator');
              setIsTransitioning(true);
              setTimeout(() => onNavigateToSimulator(), 500);
            }}
            onMouseEnter={() => setHoveredCard('simulator')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="welcome-card-header">
              <div className="welcome-card-icon simulator-icon">
                <div className="icon-grid">
                  <div className="grid-dot"></div>
                  <div className="grid-dot"></div>
                  <div className="grid-dot"></div>
                  <div className="grid-dot"></div>
                </div>
              </div>
              <h3 className="welcome-card-title">Simulator</h3>
            </div>
            <div className="welcome-card-content">
              <p className="welcome-card-description">
                Test and refine your herding strategies in a safe, controlled environment.
              </p>
              <div className="welcome-card-features">
                <span className="feature-tag">Scenario Testing</span>
                <span className="feature-tag">Analytics</span>
                <span className="feature-tag">Custom Config</span>
              </div>
            </div>
            <div className="welcome-card-action">
              <div className="action-arrow">→</div>
            </div>
          </div>
          
          <div 
            className={`choice-option lp-card welcome-card ${selectedCard === 'real' ? "selected" : ""}`}
            onClick={() => {
              setSelectedCard('real');
              setIsTransitioning(true);
              setTimeout(() => onNavigateToRealSystem(), 500);
            }}
            onMouseEnter={() => setHoveredCard('real')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="welcome-card-header">
              <div className="welcome-card-icon operations-icon">
                <div className="drone-symbol">
                  <div className="drone-body"></div>
                  <div className="drone-prop"></div>
                  <div className="drone-prop"></div>
                </div>
              </div>
              <h3 className="welcome-card-title">Live Operations</h3>
            </div>
            <div className="welcome-card-content">
              <p className="welcome-card-description">
                Deploy your drone fleet for real-world herding operations.
              </p>
              <div className="welcome-card-features">
                <span className="feature-tag">Real-time</span>
                <span className="feature-tag">Live Control</span>
                <span className="feature-tag">Monitoring</span>
              </div>
            </div>
            <div className="welcome-card-action">
              <div className="action-arrow">→</div>
            </div>
          </div>
        </div>

        {/* Description Panel */}
        <div className="lp-panel">
          <div className="welcome-description">
            {selectedCard === 'simulator' ? (
              <div>
                <h3>Simulation Environment</h3>
                <p>Test and refine your herding strategies in a safe, controlled environment. Perfect for training, scenario planning, and algorithm development.</p>
                <div className="feature-list">
                  <div className="feature-item">
                    <strong>Scenario Testing:</strong> Create custom scenarios with different flock sizes and configurations
                  </div>
                  <div className="feature-item">
                    <strong>Performance Analytics:</strong> Analyze herding efficiency and drone coordination
                  </div>
                  <div className="feature-item">
                    <strong>Custom Configurations:</strong> Adjust parameters and test different strategies
                  </div>
                </div>
              </div>
            ) : selectedCard === 'real' ? (
              <div>
                <h3>Live Operations</h3>
                <p>Deploy your drone fleet for real-world herding operations. Connect to live drone systems and execute autonomous herding missions.</p>
                <div className="feature-list">
                  <div className="feature-item">
                    <strong>Real-time Monitoring:</strong> Live tracking of drone positions and herd movements
                  </div>
                  <div className="feature-item">
                    <strong>Live Communication:</strong> Direct control and coordination with drone systems
                  </div>
                  <div className="feature-item">
                    <strong>Remote Control:</strong> Manual override and emergency controls
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3>Choose Your Mode</h3>
                <p>Select between simulation training or live operations to begin your drone herding mission.</p>
                <div className="welcome-features">
                  <div className="welcome-feature">
                    <div className="feature-icon">Simulation</div>
                    <p>Safe testing environment</p>
                  </div>
                  <div className="welcome-feature">
                    <div className="feature-icon">Live Operations</div>
                    <p>Real-world deployment</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
