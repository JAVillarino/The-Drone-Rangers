interface TabNavigationProps {
  activeTab: 'schedule' | 'live-farm';
  onTabChange: (tab: 'schedule' | 'live-farm') => void;
}

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="tab-navigation">
      <button
        className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`}
        onClick={() => onTabChange('schedule')}
      >
        Schedule View
      </button>
      <button
        className={`tab-button ${activeTab === 'live-farm' ? 'active' : ''}`}
        onClick={() => onTabChange('live-farm')}
      >
        Live Farm View
      </button>
    </div>
  );
}
