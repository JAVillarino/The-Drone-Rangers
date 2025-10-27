import { useEffect, useState, useRef } from 'react';
import { State } from '../types';

interface UseSSEOptions {
  url: string;
  enabled: boolean;
  onError?: (error: Event) => void;
}

export function useSSE({ url, enabled, onError }: UseSSEOptions) {
  const [data, setData] = useState<State | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Only connect when enabled (MapPlot is mounted)
    if (!enabled) {
      return;
    }

    // Create EventSource connection
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Handle connection opened
    eventSource.onopen = () => {
      console.log('SSE connection established');
      setIsConnected(true);
    };

    // Handle stateUpdate events
    eventSource.addEventListener('stateUpdate', (event: MessageEvent) => {
      try {
        const parsedData: State = JSON.parse(event.data);
        setData(parsedData);
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    });

    // Handle errors
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
      
      // Close the connection on error to prevent continuous retries
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        eventSourceRef.current = null;
      }
      
      if (onError) {
        onError(error);
      }
    };

    // Cleanup on unmount or when disabled
    return () => {
      console.log('Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [url, enabled, onError]);

  return { data, isConnected, hasError: !isConnected && data === null };
}
