import { useEffect, useState, useRef } from 'react';
import { State } from '../types';

interface UseSSEOptions {
  url: string;
  enabled: boolean;
  onError?: (error: Event) => void;
  retryInterval?: number; // Retry interval in milliseconds (default: 60000 = 60 seconds)
}

export function useSSE({ url, enabled, onError, retryInterval = 60000 }: UseSSEOptions) {
  const [data, setData] = useState<State | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const hasAttemptedRef = useRef<boolean>(false);
  const enabledRef = useRef<boolean>(enabled);
  const onErrorRef = useRef<UseSSEOptions['onError']>(onError);

  // Keep refs in sync
  useEffect(() => {
    enabledRef.current = enabled;
    onErrorRef.current = onError;
  }, [enabled, onError]);

  useEffect(() => {
    // Reset attempt flag when URL changes
    hasAttemptedRef.current = false;

    const attemptConnection = () => {
      // Don't create a new connection if one already exists
      if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
        return;
      }

      // Clear any existing retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Check if still enabled before attempting
      if (!enabledRef.current) {
        return;
      }

      console.log('Attempting SSE connection...');
      hasAttemptedRef.current = true;

      // Create EventSource connection
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Handle connection opened
      eventSource.onopen = () => {
        console.log('SSE connection established');
        setIsConnected(true);
        // Clear retry timeout on successful connection
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
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
        
        // Close the connection on error
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          eventSourceRef.current = null;
        }
        
        // Schedule retry after retryInterval if still enabled and no timeout already scheduled
        if (enabledRef.current && !retryTimeoutRef.current) {
          console.log(`SSE connection failed. Retrying in ${retryInterval / 1000} seconds...`);
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null;
            // Check if still enabled and not connected before retrying
            if (enabledRef.current && eventSourceRef.current?.readyState !== EventSource.OPEN) {
              attemptConnection();
            }
          }, retryInterval);
        }
        
        if (onErrorRef.current) {
          onErrorRef.current(error);
        }
      };
    };

    // Only connect when enabled
    if (!enabled) {
      // Clean up when disabled
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setIsConnected(false);
      hasAttemptedRef.current = false;
      return;
    }

    // Try initial connection
    attemptConnection();

    // Cleanup on unmount or when disabled
    return () => {
      if (eventSourceRef.current) {
        console.log('Closing SSE connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setIsConnected(false);
    };
  }, [url, enabled, retryInterval]);

  return { data, isConnected, hasError: !isConnected && data === null };
}
