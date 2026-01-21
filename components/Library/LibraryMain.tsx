
import React, { useState, useMemo, useEffect, useRef } from 'react';
// @ts-ignore
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { LibraryItem, LibraryType } from '../../types';
import { deleteLibraryItem, saveLibraryItem, fetchLibraryPaginated } from '../../services/gasService';
import { useAsyncWorkflow } from '../../hooks/useAsyncWorkflow';
import { useOptimisticUpdate } from '../../hooks/useOptimisticUpdate';
import { 
  TrashIcon, 
  BookmarkIcon, 
  StarIcon, 
  PlusIcon, 
  ChevronUpIcon, 
  ChevronDownIcon, 
  ArrowsUpDownIcon,
  AdjustmentsHorizontalIcon,
  CheckIcon,
  EyeIcon,
  DocumentIcon,
  LinkIcon,
  CheckCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { 
  BookmarkIcon as BookmarkSolid, 
  StarIcon as StarSolid,
  CheckCircleIcon as CheckCircleSolid
} from '@heroicons/react/24/solid';
import { SmartSearchBox } from '../Common/SearchComponents';
import { 
  StandardTableContainer, 
  StandardTableWrapper, 
  StandardTh, 
  StandardTr, 
  StandardTd, 
  StandardTableFooter, 
  StandardCheckbox,
  StandardGridContainer,
  StandardItemCard
} from '../Common/TableComponents';
import { 
  StandardQuickAccessBar, 
  StandardQuickActionButton, 
  StandardPrimaryButton as AddButton,
  StandardPrimaryButton, 
  StandardFilterButton 
} from '../Common/ButtonComponents';
import { TableSkeletonRows, CardGridSkeleton } from '../Common/LoadingComponents';
import LibraryDetailView from './LibraryDetailView';
import { showXeenapsAlert } from '../../utils/swalUtils';
import { showXeenapsDeleteConfirm } from '../../utils/confirmUtils';
import { showXeenapsToast } from '../../utils/toastUtils';

/**
 * Custom Tooltip Component for truncated text
 * Implements "Overlay Expansion" using React Portal.
 * Fixed: Uniform text sizing for all types and dynamic box width based on content.
 */
const ElegantTooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      
      // Calculate start position
      let finalLeft = rect.left - 16;
      if (finalLeft < 10) finalLeft = 10;

      setPos({
        top: rect.top - 8, 
        left: finalLeft,
        minWidth: rect.width + 32
      });
      setShow(true);
    }
  };

  if (!text || text === '-' || text === 'N/A') return <div className="w-full">{children}</div>;

  return (
    <div 
      ref={anchorRef}
      className="w-full block relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && createPortal(
        <div 
          className="fixed z-[10000] pointer-events-none glass rounded-[1.5rem] border border-[#004A74]/30 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
          style={{ 
            left: `${pos.left}px`, 
            top: `${pos.top}px`,
            width: 'fit-content',
            minWidth: `${pos.minWidth}px`,
            maxWidth: 'min(600px, 90vw)'
          }}
        >
          <div className="p-4 flex items-start gap-3">
            <div className="shrink-0 mt-0.5 bg-[#004A74]/10 p-1 rounded-lg">
              <InformationCircleIcon className="w-3.5 h-3.5 text-[#004A74]" />
            </div>
            {/* Unified style: text-xs font-medium italic for all meta data expansion */}
            <p className="text-[#004A74] text-xs font-medium italic leading-relaxed break-words whitespace-normal">
              {text}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

interface LibraryMainProps {
  items: LibraryItem[];
  isLoading: boolean;
  onRefresh: () => void;
  globalSearch: string;
}

type SortConfig = {
  key: keyof LibraryItem | 'none';
  direction: 'asc' | 'desc' | null;
};

const LibraryMain: React.FC<LibraryMainProps> = ({ items: initialItems, isLoading: isGlobalLoading, onRefresh, globalSearch }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const workflow = useAsyncWorkflow(30000);
  const { performUpdate, performDelete } = useOptimisticUpdate<LibraryItem>();
  
  const [serverItems, setServerItems] = useState<LibraryItem[]>([]);
  const [totalItemsServer, setTotalItemsServer] = useState(0);
  const [isInternalLoading, setIsInternalLoading] = useState(false);
  
  const [localSearch, setLocalSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | LibraryType>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const itemsPerPage = isMobile ? 20 : 25;
  const filters: ('All' | LibraryType)[] = ['All', LibraryType.LITERATURE, LibraryType.TASK, LibraryType.PERSONAL, LibraryType.OTHER];
  
  useEffect(() => {
    if (globalSearch && !appliedSearch) {
      setLocalSearch(globalSearch);
      setAppliedSearch(globalSearch);
    }
  }, [globalSearch]);

  useEffect(() => {
    workflow.execute(
      async (signal) => {
        setIsInternalLoading(true);
        const pathPart = location.pathname.substring(1); 
        
        const sortKey = sortConfig.key === 'none' ? 'createdAt' : sortConfig.key;
        const sortDir = sortConfig.direction || 'desc';

        const result = await fetchLibraryPaginated(
          currentPage, 
          itemsPerPage, 
          appliedSearch, 
          activeFilter, 
          pathPart,
          sortKey,
          sortDir,
          signal
        );
        setServerItems(result.items);
        setTotalItemsServer(result.totalCount);
      },
      () => setIsInternalLoading(false),
      (err) => {
        setIsInternalLoading(false);
      }
    );
  }, [currentPage, appliedSearch, activeFilter, location.pathname, itemsPerPage, sortConfig.key, sortConfig.direction, onRefresh]);

  const handleSearchTrigger = () => {
    setAppliedSearch(localSearch);
    setCurrentPage(1);
  };

  const handleSort = (key: keyof LibraryItem) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    setSortConfig({ key: direction ? key : 'none', direction });
    setCurrentPage(1); 
  };

  const getSortIcon = (key: keyof LibraryItem) => {
    if (sortConfig.key !== key) return <ArrowsUpDownIcon className="w-3 h-3 text-gray-300" />;
    if (sortConfig.direction === 'asc') return <ChevronUpIcon className="w-3 h-3 text-[#004A74]" />;
    if (sortConfig.direction === 'desc') return <ChevronDownIcon className="w-3 h-3 text-[#004A74]" />;
    return <ArrowsUpDownIcon className="w-3 h-3 text-gray-300" />;
  };

  const totalPages = Math.ceil(totalItemsServer / itemsPerPage);

  const toggleSelectAll = () => {
    if (selectedIds.length === serverItems.length && serverItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(serverItems.map(item => item.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  /**
   * Selection State Logic for Dynamic Icons
   */
  const { anyUnbookmarked, anyUnfavorited } = useMemo(() => {
    const selectedItemsForIcons = serverItems.filter(i => selectedIds.includes(i.id));
    return {
      anyUnbookmarked: selectedItemsForIcons.some(i => !i.isBookmarked),
      anyUnfavorited: selectedItemsForIcons.some(i => !i.isFavorite)
    };
  }, [selectedIds, serverItems]);

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    
    // 1. Confirmation Modal (Xeenaps Reusable Danger Style)
    const confirmed = await showXeenapsDeleteConfirm(selectedIds.length);
    if (!confirmed) return;

    // 2. Instant UX: Reset selectedIds immediately to hide Quick Access Bar
    const idsToDelete = [...selectedIds];
    setSelectedIds([]);

    // 3. Optimized: Batch Delete with Optimistic UI (Instant removal from UI)
    await performDelete(
      serverItems,
      setServerItems,
      idsToDelete,
      async (id) => await deleteLibraryItem(id),
      (err) => {
        showXeenapsAlert({
          icon: 'error',
          title: 'SYNC FAILED',
          text: 'One or more items (and their files) could not be deleted from the server. Local state has been rolled back.'
        });
      }
    );

    // 4. Success Toast Notification
    showXeenapsToast('success', 'Bulk deletion processed successfully');
  };

  /**
   * Optimized: Seamless handleBatchAction with Optimistic UI
   */
  const handleBatchAction = async (property: 'isBookmarked' | 'isFavorite') => {
    if (selectedIds.length === 0) return;
    
    const selectedItems = serverItems.filter(i => selectedIds.includes(i.id));
    const anyFalse = selectedItems.some(i => !i[property]);
    const newValue = anyFalse;

    // Trigger Optimistic Update (Instant UI, Background Sync)
    await performUpdate(
      serverItems,
      setServerItems,
      selectedIds,
      (item) => ({ ...item, [property]: newValue }),
      async (updatedItem) => {
        return await saveLibraryItem(updatedItem);
      },
      (err) => {
        showXeenapsAlert({
          icon: 'error',
          title: 'SYNC FAILED',
          text: 'Background update failed. Local state has been rolled back.'
        });
      }
    );
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      const day = d.getDate().toString().padStart(2, '0');
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${day} ${month} ${year} ${hours}:${minutes}`;
    } catch {
      return '-';
    }
  };

  const tableColumns: { key: keyof LibraryItem; label: string; width?: string }[] = [
    { key: 'title', label: 'Title', width: '300px' },
    { key: 'author', label: 'Author(s)', width: '200px' },
    { key: 'publisher', label: 'Publisher', width: '200px' },
    { key: 'year', label: 'Year', width: '80px' },
    { key: 'category', label: 'Category', width: '150px' },
    { key: 'topic', label: 'Topic', width: '150px' },
    { key: 'subTopic', label: 'Sub Topic', width: '150px' },
    { key: 'createdAt', label: 'Created At', width: '150px' },
  ];

  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto no-scrollbar space-y-4 animate-in fade-in duration-500 relative pr-1">
      {selectedItem && (
        <LibraryDetailView item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between shrink-0">
        <SmartSearchBox 
          value={localSearch} 
          onChange={setLocalSearch} 
          onSearch={handleSearchTrigger}
        />
        <AddButton onClick={() => navigate('/add')} icon={<PlusIcon className="w-5 h-5" />}>Add Collection</AddButton>
      </div>

      <div className="flex items-center justify-between lg:justify-start gap-4 shrink-0 relative z-[30]">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-2 no-scrollbar flex-1">
          {filters.map(filter => (
            <StandardFilterButton 
              key={filter} 
              isActive={activeFilter === filter} 
              onClick={() => { setActiveFilter(filter); setCurrentPage(1); }}
            >
              {filter}
            </StandardFilterButton>
          ))}
        </div>
      </div>

      {/* Utility Row: Mobile Only (Sorter | Select All) - Center align row under filter, buttons rata kiri */}
      <div className="lg:hidden flex items-center justify-start gap-4 px-1 py-1 shrink-0">
        <div className="relative">
          <button 
            onClick={() => setShowSortMenu(!showSortMenu)} 
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${showSortMenu ? 'bg-[#004A74] border-[#004A74] text-white shadow-md' : 'bg-white border-gray-100 text-[#004A74] shadow-sm'}`}
          >
            <AdjustmentsHorizontalIcon className="w-4 h-4 stroke-[2.5]" />
            <span className="text-[10px] font-black uppercase tracking-widest">Sort</span>
          </button>
          
          {showSortMenu && (
            <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[60] p-2 animate-in fade-in zoom-in-95">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 py-2 border-b border-gray-50 mb-1">Sort By</p>
              {[
                {k: 'title', l: 'Title'}, 
                {k: 'author', l: 'Author'}, 
                {k: 'publisher', l: 'Publisher'}, 
                {k: 'year', l: 'Year'}, 
                {k: 'category', l: 'Category'}, 
                {k: 'topic', l: 'Topic'}, 
                {k: 'subTopic', l: 'Sub Topic'}, 
                {k: 'createdAt', l: 'Created At'}
              ].map((item) => (
                <button 
                  key={item.k} 
                  onClick={() => { handleSort(item.k as keyof LibraryItem); setShowSortMenu(false); }} 
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${sortConfig.key === item.k ? 'bg-[#004A74]/10 text-[#004A74]' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <span>{item.l}</span>
                  {sortConfig.key === item.k && (sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3 stroke-[3]" /> : <ChevronDownIcon className="w-3 h-3 stroke-[3]" />)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200" />

        <button 
          onClick={toggleSelectAll}
          className={`text-[10px] font-black uppercase tracking-widest transition-all ${selectedIds.length === serverItems.length && serverItems.length > 0 ? 'text-red-500' : 'text-[#004A74]'}`}
        >
          {selectedIds.length === serverItems.length && serverItems.length > 0 ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <StandardQuickAccessBar isVisible={selectedIds.length > 0} selectedCount={selectedIds.length}>
        <StandardQuickActionButton variant="danger" onClick={handleBatchDelete}><TrashIcon className="w-5 h-5" /></StandardQuickActionButton>
        <StandardQuickActionButton variant="primary" onClick={() => handleBatchAction('isBookmarked')}>
          {anyUnbookmarked ? <BookmarkSolid className="w-5 h-5" /> : <BookmarkIcon className="w-5 h-5" />}
        </StandardQuickActionButton>
        <StandardQuickActionButton variant="warning" onClick={() => handleBatchAction('isFavorite')}>
          {anyUnfavorited ? <StarSolid className="w-5 h-5" /> : <StarIcon className="w-5 h-5" />}
        </StandardQuickActionButton>
      </StandardQuickAccessBar>

      <div className="hidden lg:flex flex-col flex-none">
        <StandardTableContainer>
          <StandardTableWrapper>
            <thead className="sticky top-0 z-[50]">
              <tr>
                <th className="sticky left-0 z-[60] px-6 py-4 w-12 bg-gray-50 border-r border-gray-100/50 shadow-sm text-center">
                  <div className="flex items-center justify-center">
                    <StandardCheckbox onChange={toggleSelectAll} checked={serverItems.length > 0 && selectedIds.length === serverItems.length} />
                  </div>
                </th>
                {tableColumns.map(col => (
                  <StandardTh 
                    key={col.key} 
                    onClick={() => handleSort(col.key)} 
                    isActiveSort={sortConfig.key === col.key}
                    width={col.width}
                    className={col.key === 'title' ? 'sticky left-12 z-[55] border-r border-gray-100/50 shadow-sm' : ''}
                  >
                    {col.label} {getSortIcon(col.key)}
                  </StandardTh>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isInternalLoading ? (
                <TableSkeletonRows count={5} />
              ) : serverItems.length === 0 ? (
                <tr><td colSpan={tableColumns.length + 1} className="px-6 py-24 text-center"><div className="flex flex-col items-center justify-center space-y-2"><div className="p-4 bg-gray-50 rounded-full"><PlusIcon className="w-8 h-8 text-gray-300" /></div><p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No Collection Found</p></div></td></tr>
              ) : (
                serverItems.map((item) => (
                  <StandardTr key={item.id} className="cursor-pointer" onClick={() => setSelectedItem(item)}>
                    <td className="px-6 py-4 sticky left-0 z-20 border-r border-gray-100/50 bg-white group-hover:bg-[#f0f7fa] shadow-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <StandardCheckbox checked={selectedIds.includes(item.id)} onChange={() => toggleSelectItem(item.id)} />
                    </td>
                    <StandardTd isActiveSort={sortConfig.key === 'title'} className="sticky left-12 z-20 border-r border-gray-100/50 bg-white group-hover:bg-[#f0f7fa] shadow-sm">
                      <ElegantTooltip text={item.title}>
                        <div className="flex items-start gap-2 group/title w-full">
                          <div className="flex-1 min-w-0">
                            <div className="block overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              <span className="inline-flex items-center gap-1 mr-1.5 align-middle shrink-0">
                                {item.isBookmarked && <BookmarkSolid className="w-3.5 h-3.5 text-[#004A74]" />}
                                {item.isFavorite && <StarSolid className="w-3.5 h-3.5 text-[#FED400]" />}
                              </span>
                              <span className="text-sm font-bold text-[#004A74] group-hover/title:underline leading-tight transition-all">
                                {item.title}
                              </span>
                            </div>
                          </div>
                          <EyeIcon className="w-3.5 h-3.5 text-gray-300 group-hover/title:text-[#004A74] opacity-0 group-hover/title:opacity-100 transition-all shrink-0 mt-1" />
                        </div>
                      </ElegantTooltip>
                    </StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'author'}>
                      <ElegantTooltip text={item.author}>
                        <div className="text-xs text-gray-600 italic text-center w-full block overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {item.author || '-'}
                        </div>
                      </ElegantTooltip>
                    </StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'publisher'}>
                      <ElegantTooltip text={item.publisher}>
                        <div className="text-xs text-gray-600 text-center w-full block overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {item.publisher || '-'}
                        </div>
                      </ElegantTooltip>
                    </StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'year'} className="text-xs text-gray-600 font-mono text-center">{item.year || '-'}</StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'category'} className="text-xs text-gray-600 text-center">
                      <div className="line-clamp-2">{item.category || '-'}</div>
                    </StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'topic'}>
                      <ElegantTooltip text={item.topic}>
                        <div className="text-xs text-gray-600 text-center w-full block overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {item.topic || '-'}
                        </div>
                      </ElegantTooltip>
                    </StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'subTopic'}>
                      <ElegantTooltip text={item.subTopic}>
                        <div className="text-xs text-gray-600 text-center w-full block overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {item.subTopic || '-'}
                        </div>
                      </ElegantTooltip>
                    </StandardTd>
                    <StandardTd isActiveSort={sortConfig.key === 'createdAt'} className="text-xs font-medium text-gray-400 whitespace-nowrap text-center">{formatDateTime(item.createdAt)}</StandardTd>
                  </StandardTr>
                ))
              )}
            </tbody>
          </StandardTableWrapper>
          <StandardTableFooter totalItems={totalItemsServer} currentPage={currentPage} itemsPerPage={itemsPerPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </StandardTableContainer>
      </div>

      <div className="lg:hidden flex-none pb-10">
        {isInternalLoading ? (
          <CardGridSkeleton count={6} />
        ) : serverItems.length === 0 ? (
          <div className="py-24 text-center flex flex-col items-center justify-center space-y-2 bg-white border border-gray-100/50 rounded-[2rem] shadow-sm mx-1">
            <div className="p-4 bg-gray-50 rounded-full">
              <PlusIcon className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No Collection Found</p>
          </div>
        ) : (
          <StandardGridContainer>
            {serverItems.map((item) => (
              <StandardItemCard 
                key={item.id} 
                isSelected={selectedIds.includes(item.id)} 
                onClick={() => setSelectedItem(item)}
              >
                {/* Floating Status Icons Top Right */}
                <div className="absolute top-4 right-4 flex gap-1.5 z-10">
                  {item.isBookmarked && <BookmarkSolid className="w-4 h-4 text-[#004A74] drop-shadow-sm" />}
                  {item.isFavorite && <StarSolid className="w-4 h-4 text-[#FED400] drop-shadow-sm" />}
                </div>

                <div className="flex items-center gap-3 mb-2" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => toggleSelectItem(item.id)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${selectedIds.includes(item.id) ? 'bg-[#004A74] border-[#004A74] text-white' : 'bg-white border-gray-200'}`}
                  >
                    {selectedIds.includes(item.id) && <CheckIcon className="w-3 h-3 stroke-[4]" />}
                  </button>
                  <span className="text-[8px] font-black uppercase tracking-widest bg-[#004A74] text-white px-2 py-0.5 rounded-full line-clamp-2">
                    {item.category || 'GENERAL'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#004A74] opacity-80 line-clamp-2">
                    {item.topic || 'NO TOPIC'}
                  </span>
                </div>
                <div className="mt-[-4px] mb-2">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter line-clamp-2">
                    {item.subTopic || 'No Sub Topic'}
                  </span>
                </div>
                <div className="flex items-start gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#004A74] line-clamp-2 leading-tight">
                      {item.title}
                    </h3>
                  </div>
                </div>
                <p className="text-xs font-medium text-gray-500 italic line-clamp-2 mb-1">
                  {item.author || 'Unknown Author'}
                </p>
                <p className="text-[11px] text-gray-400 truncate mb-4">
                  {item.publisher || '-'}
                </p>
                <div className="h-px bg-gray-50 mb-3" />
                <div className="flex items-center justify-between text-gray-400">
                  <span className="text-xs font-mono font-black text-[#004A74]">
                    {item.year || '-'}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-tight">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>
              </StandardItemCard>
            ))}
          </StandardGridContainer>
        )}
        {totalPages > 1 && <div className="pt-8"><StandardTableFooter totalItems={totalItemsServer} currentPage={currentPage} itemsPerPage={itemsPerPage} totalPages={totalPages} onPageChange={setCurrentPage} /></div>}
      </div>
    </div>
  );
};

export default LibraryMain;
