import { useRef, useEffect } from 'react';

interface ScenarioMenuProps {
    onClose: () => void;
    onSelectScenario: (scenario: string) => void;
}

export default function ScenarioMenu({ onClose, onSelectScenario }: ScenarioMenuProps){
    // Eventually: probably request from backend set of preset scenarios
    // for now, placeholders lolol

    const scenarios = ["Uniform", "Clustered", "Random", "Custom"];
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            // If the click is outside the menu's DOM element, call onClose
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        // Add the event listener when the component mounts
        document.addEventListener("mousedown", handleClickOutside);
        
        // Clean up the event listener when the component unmounts
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef, onClose]);


    function handleScenarioSelect(scenario: string) {
        console.log("Scenario selected:", scenario);
        onSelectScenario(scenario); // Pass the selected scenario up to the parent
        onClose(); // Close the menu after selection
    }

    return (
        <div id="scenario-menu-container">
            <ul>
                {scenarios.map((scenario) => (
                    <li key={`${scenario}-scenario`}>
                        <button onClick={() => handleScenarioSelect(scenario)}>
                            {scenario}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );

}