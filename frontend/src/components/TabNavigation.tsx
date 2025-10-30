interface TabOption<T> {
  /** Unique key representing the tab */
  key: T;
  /** Display name for the tab button */
  label: string;
}

interface TabNavigationProps<T> {
  /** Array of tab options, e.g. [{ key: 'schedule', label: 'Schedule View' }, ...] */
  tabs: TabOption<T>[];
  /** The currently active tab key */
  activeTab: T;
  /** Callback fired when a tab changes */
  onTabChange: (tab: T) => void;
}

/**
 * Reusable tab navigation component.
 * Just pass in a list of tab options.
 */
export default function TabNavigation<T>({
  tabs,
  activeTab,
  onTabChange,
}: TabNavigationProps<T>) {
  return (
    <div className="tab-navigation">
      {tabs.map(({ key, label }) => (
        <button
          key={label}
          className={`tab-button ${activeTab === key ? 'active' : ''}`}
          onClick={() => onTabChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
