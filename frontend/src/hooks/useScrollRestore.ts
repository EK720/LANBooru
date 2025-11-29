import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SCROLL_STORAGE_KEY = 'gallery-scroll-state';

interface ScrollState {
  pathname: string;
  search: string;
  scrollY: number;
  loadedPages: number;
}

export function useScrollRestore(loadedPages: number) {
  const location = useLocation();
  const hasRestoredRef = useRef(false);
  const scrollKey = `${location.pathname}${location.search}`;

  // Save scroll position before navigating away
  const saveScrollPosition = useCallback(() => {
    const state: ScrollState = {
      pathname: location.pathname,
      search: location.search,
      scrollY: window.scrollY,
      loadedPages,
    };
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(state));
  }, [location.pathname, location.search, loadedPages]);

  // Restore scroll position on mount/navigation
  useEffect(() => {
    if (hasRestoredRef.current) return;

    const savedState = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!savedState) return;

    try {
      const state: ScrollState = JSON.parse(savedState);
      // Only restore if returning to same path+search
      if (state.pathname === location.pathname && state.search === location.search) {
        // Wait for content to render
        requestAnimationFrame(() => {
          window.scrollTo(0, state.scrollY);
          hasRestoredRef.current = true;
        });
      }
    } catch {
      // Invalid state, ignore
    }
  }, [location.pathname, location.search]);

  // Reset restored flag when path changes
  useEffect(() => {
    hasRestoredRef.current = false;
  }, [scrollKey]);

  // Get saved loaded pages count for initial load
  const getSavedLoadedPages = useCallback((): number => {
    const savedState = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!savedState) return 1;

    try {
      const state: ScrollState = JSON.parse(savedState);
      if (state.pathname === location.pathname && state.search === location.search) {
        return state.loadedPages;
      }
    } catch {
      // Invalid state
    }
    return 1;
  }, [location.pathname, location.search]);

  return { saveScrollPosition, getSavedLoadedPages };
}
