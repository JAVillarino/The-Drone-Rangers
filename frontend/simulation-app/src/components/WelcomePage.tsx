import { useState } from "react";
import "./LandingPage.css";

interface WelcomePageProps {
  onNavigateToSimulator: () => void;
  onNavigateToMetrics: () => void;
}

export default function WelcomePage({ onNavigateToSimulator, onNavigateToMetrics }: WelcomePageProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
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

          {/* Metrics Option */}
          <div
            className={`choice-option lp-card welcome-card ${selectedCard === 'metrics' ? "selected" : ""}`}
            onClick={() => {
              setSelectedCard('metrics');
              setIsTransitioning(true);
              setTimeout(() => onNavigateToMetrics(), 500);
            }}
            onMouseEnter={() => setHoveredCard('metrics')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="welcome-card-header">
              <div className="welcome-card-icon metrics-icon">
                <span style={{ fontSize: '24px' }}>📊</span>
              </div>
              <h3 className="welcome-card-title">Metrics & History</h3>
            </div>
            <div className="welcome-card-content">
              <p className="welcome-card-description">
                Review past simulation runs and analyze performance data.
              </p>
              <div className="welcome-card-features">
                <span className="feature-tag">Run History</span>
                <span className="feature-tag">Performance Stats</span>
                <span className="feature-tag">Data Export</span>
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
            {(selectedCard || hoveredCard) === 'simulator' ? (
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
            ) : (selectedCard || hoveredCard) === 'metrics' ? (
              <div>
                <h3>Metrics Dashboard</h3>
                <p>Deep dive into your simulation performance. Track progress over time and identify areas for improvement.</p>
                <div className="feature-list">
                  <div className="feature-item">
                    <strong>Run History:</strong> Access a complete log of all your simulation runs
                  </div>
                  <div className="feature-item">
                    <strong>Detailed Stats:</strong> View success rates, time-to-goal, and cohesiveness scores
                  </div>
                  <div className="feature-item">
                    <strong>Comparative Analysis:</strong> Compare different strategies and configurations
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3>Welcome to Drone Rangers</h3>
                <p>Select an option to get started.</p>
                <div className="welcome-features">
                  <div className="welcome-feature">
                    <div className="feature-icon">Simulation</div>
                    <p>Safe testing environment</p>
                  </div>
                  <div className="welcome-feature">
                    <div className="feature-icon">Metrics</div>
                    <p>Performance tracking</p>
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
