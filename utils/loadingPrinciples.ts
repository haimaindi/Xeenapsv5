
/**
 * XEENAPS LOADING PRINCIPLES
 * Core constants to maintain UX consistency across all loading states.
 */

export const LOADING_CONFIG = {
  // Animation duration in seconds (shimmer effect)
  SHIMMER_DURATION: '1.5s',
  
  // Base colors for skeletons - Using Brand Identity with Transparency
  SKELETON_BG: 'rgba(0, 74, 116, 0.1)',
  SKELETON_SHIMMER: 'rgba(254, 212, 0, 0.1)',
  
  // Threshold in ms: If data takes less than this, maybe don't show skeleton to avoid flickering
  // Use with caution in components
  SKELETON_THRESHOLD: 300,
  
  // Standard item counts for skeletons
  DEFAULT_TABLE_ROWS: 5,
  DEFAULT_CARD_COUNT: 6,
};

/**
 * Standard utility to determine if we should show a skeleton
 * based on a timestamp if needed in the future.
 */
export const shouldShowSkeleton = (startTime: number): boolean => {
  return (Date.now() - startTime) > LOADING_CONFIG.SKELETON_THRESHOLD;
};
