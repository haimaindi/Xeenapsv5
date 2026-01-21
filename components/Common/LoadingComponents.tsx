
import React from 'react';
import { StandardGridContainer } from './TableComponents';

/**
 * GlobalAppLoader
 * Mirrors the App.tsx main structure (Sidebar + Header + Content Area)
 */
export const GlobalAppLoader: React.FC = () => (
  <div className="w-full h-full p-1 space-y-8 animate-in fade-in duration-500 overflow-hidden">
    {/* Top bar skeleton (Search & Add) */}
    <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
      <div className="h-12 w-full lg:max-w-md skeleton rounded-2xl" />
      <div className="h-12 w-full lg:w-48 skeleton rounded-2xl" />
    </div>
    
    {/* Filters skeleton */}
    <div className="flex gap-2 overflow-hidden shrink-0">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-9 w-24 skeleton rounded-full shrink-0" />
      ))}
    </div>
    
    {/* Content grid skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-60 w-full skeleton rounded-[2.5rem]" />
      ))}
    </div>
    
    {/* Bottom large area skeleton */}
    <div className="hidden lg:block h-32 w-full skeleton rounded-[2.5rem]" />
  </div>
);

/**
 * TableSkeletonRows
 * Mirroring the exact column distribution of StandardTableWrapper
 * Updated: Using .skeleton class for branded loading consistency.
 */
export const TableSkeletonRows: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <>
    {[...Array(count)].map((_, i) => (
      <tr key={i} className="animate-pulse">
        <td className="px-6 py-4"><div className="h-4 w-4 skeleton rounded mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-64 skeleton rounded-lg" /></td>
        <td className="px-6 py-4"><div className="h-4 w-32 skeleton rounded-lg mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-32 skeleton rounded-lg mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-12 skeleton rounded-lg mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-24 skeleton rounded-lg mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-24 skeleton rounded-lg mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-24 skeleton rounded-lg mx-auto" /></td>
        <td className="px-6 py-4"><div className="h-4 w-32 skeleton rounded-lg mx-auto" /></td>
      </tr>
    ))}
  </>
);

/**
 * CardGridSkeleton
 * Mirroring the structure of StandardItemCard inside StandardGridContainer
 */
export const CardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <StandardGridContainer>
    {[...Array(count)].map((_, i) => (
      <div key={i} className="h-48 w-full skeleton rounded-3xl" />
    ))}
  </StandardGridContainer>
);
