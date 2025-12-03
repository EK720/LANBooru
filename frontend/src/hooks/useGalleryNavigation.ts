import { useCallback } from 'react';

const NAV_STORAGE_KEY = 'gallery-nav-context';

interface NavigationContext {
  imageIds: number[];
  searchQuery: string;
  sort?: string;
  currentPage: number;
  hasNextPage: boolean;
}

/**
 * Hook to manage gallery navigation context.
 * Stores image IDs when navigating from gallery to image page,
 * allowing prev/next navigation on the image page.
 */
export function useGalleryNavigation() {
  // Save navigation context before navigating to an image
  const saveNavigationContext = useCallback((
    imageIds: number[],
    searchQuery: string,
    currentPage: number,
    hasNextPage: boolean,
    sort?: string
  ) => {
    const context: NavigationContext = { imageIds, searchQuery, currentPage, hasNextPage, sort };
    sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(context));
  }, []);

  // Update context with new images (when loading more from image page)
  const appendToNavigationContext = useCallback((newImageIds: number[], hasNextPage: boolean) => {
    const saved = sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!saved) return;

    try {
      const context = JSON.parse(saved) as NavigationContext;
      context.imageIds = [...context.imageIds, ...newImageIds];
      context.currentPage += 1;
      context.hasNextPage = hasNextPage;
      sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(context));
    } catch {
      // Invalid state
    }
  }, []);

  // Remove an image from the navigation context (e.g., after deletion)
  const removeFromNavigationContext = useCallback((imageId: number) => {
    const saved = sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!saved) return;

    try {
      const context = JSON.parse(saved) as NavigationContext;
      context.imageIds = context.imageIds.filter(id => id !== imageId);
      sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(context));
    } catch {
      // Invalid state
    }
  }, []);

  // Get navigation context on image page
  const getNavigationContext = useCallback((): NavigationContext | null => {
    const saved = sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!saved) return null;

    try {
      return JSON.parse(saved) as NavigationContext;
    } catch {
      return null;
    }
  }, []);

  // Get prev/next image IDs relative to current image
  const getAdjacentImages = useCallback((currentImageId: number): {
    prev: number | null;
    next: number | null;
    isAtEnd: boolean;
    canLoadMore: boolean;
  } => {
    const context = getNavigationContext();
    if (!context) return { prev: null, next: null, isAtEnd: false, canLoadMore: false };

    const currentIndex = context.imageIds.indexOf(currentImageId);
    if (currentIndex === -1) return { prev: null, next: null, isAtEnd: false, canLoadMore: false };

    const isAtEnd = currentIndex === context.imageIds.length - 1;

    return {
      prev: currentIndex > 0 ? context.imageIds[currentIndex - 1] : null,
      next: currentIndex < context.imageIds.length - 1 ? context.imageIds[currentIndex + 1] : null,
      isAtEnd,
      canLoadMore: isAtEnd && context.hasNextPage,
    };
  }, [getNavigationContext]);

  return { saveNavigationContext, getNavigationContext, getAdjacentImages, appendToNavigationContext, removeFromNavigationContext };
}
