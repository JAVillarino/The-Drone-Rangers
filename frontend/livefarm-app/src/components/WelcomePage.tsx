import { useState } from "react";
import "./LandingPage.css";

interface WelcomePageProps {
  onNavigateToLiveSystem: () => void;
}

export default function WelcomePage({ onNavigateToLiveSystem }: WelcomePageProps) {
  const [isTransitioning, setIsTransitioning] = useState(false);

  return (
    <div className={`lp ${isTransitioning ? 'transitioning' : ''}`}>
      {/* Company name and slogan in upper left */}
      <div className="lp-company-header">
        <h1 className="lp-company-name">The Drone Rangers</h1>
        <p className="lp-company-slogan">Advanced Autonomous Herding Solutions</p>
      </div>

      {/* Center header with ranch name */}
      <h2 className="lp-ranch-header">King Ranch</h2>

      {/* Centered button */}
      <div className="lp-button-container">
        <button 
          className="lp-view-ranch-btn"
          onClick={() => {
            setIsTransitioning(true);
            setTimeout(() => onNavigateToLiveSystem(), 500);
          }}
        >
          View Ranch
        </button>
      </div>
    </div>
  );
}
