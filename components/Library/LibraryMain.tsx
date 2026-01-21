
import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore
import { useNavigate, useLocation } from 'react-router-dom';
import { LibraryItem, LibraryType } from '../../types';
import { deleteLibraryItem, saveLibraryItem, fetchLibrary } from '../../services/gasService';
import { 
  TrashIcon, 
  BookmarkIcon, 
  StarIcon, 
  PlusIcon, 
  EyeIcon,
  DocumentIcon,
  LinkIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { 
  BookmarkIcon as BookmarkSolid, 
  StarIcon as StarSolid
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
  StandardFilterButton 
} from '../Common/ButtonComponents';
import LibraryDetailView from './LibraryDetailView';

const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <>
    {[...Array(rows)].map((_, i) => (
      <StandardTr key={i}>
        <td className="px-6 py-4"><div className="w-4 h-4 skeleton rounded" /></td>
        {[...Array(8)].map((_, j) => (
          <StandardTd key={j}><div className="h-4 w-full skeleton rounded" /></StandardTd>
        ))}
      </StandardTr>
    ))}
  </>
);

const ElegantTooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const handleMouseMove = (e: React.MouseEvent) => setPos({ x: e.clientX + 15, y: e.clientY + 15 });
  if (!text || text === '-' || text === 'N/A') return <>{children}</>;
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onMouseMove={handleMouseMove}>
      {children}
      {show && (
        <div className="fixed z-[9999] pointer-events-none max-w-xs p-4 glass rounded-2xl border border-white/50 shadow-2xl animate-in fade-in zoom-in-95 duration-200" style={{ left: pos.x, top: pos.y }}>
          <div className="flex items-start gap-2">
            <InformationCircleIcon className="w-4 h-4 text-[#004A74] mt-0.5 shrink-0" />
            <p className="text-xs font-bold text-[#004A74] leading-relaxed break-words">{text}</p>
          </div>
        </div>
      )}
    </div>
  );
};

interface LibraryMainProps {
  onRefresh: () => void;
  globalSearch: string;
}

const LibraryMain: React.FC<LibraryMainProps> = ({ onRefresh, globalSearch }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState(globalSearch);
  const [activeFilter, setActiveFilter] = useState<'All' | LibraryType>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);

  const itemsPerPage = 25;

  const loadPagedData = useCallback(async () => {
    setIsLocalLoading(true);
    const isFavorite = location.pathname === '/favorite';
    const isBookmark = location.pathname === '/bookmark';
    const isResearch = location.pathname === '/research';

    const result = await fetchLibrary({
      page: currentPage,
      limit: itemsPerPage,
      search: searchQuery,
      type: isResearch ? LibraryType.LITERATURE : (activeFilter === 'All' ? undefined : activeFilter),
      isFavorite,
      isBookmarked: isBookmark,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });

    setItems(result.items);
    setTotalCount(result.totalCount);
    setIsLocalLoading(false);
  }, [currentPage, searchQuery, activeFilter, location.pathname]);

  useEffect(() => {
    loadPagedData();
  }, [loadPagedData]);

  const handleSearchTrigger = () => {
    setCurrentPage(1);
    loadPagedData();
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) setSelectedIds([]);
    else setSelectedIds(items.map(item => item.id));
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) await deleteLibraryItem(id);
    setSelectedIds([]);
    loadPagedData();
  };

  const handleBatchAction = async (property: 'isBookmarked' | 'isFavorite') => {
    if (selectedIds.length === 0) return;
    const selectedItems = items.filter(i => selectedIds.includes(i.id));
    const anyFalse = selectedItems.some(i => !i[property]);
    for (const item of selectedItems) await saveLibraryItem({ ...item, [property]: anyFalse });
    loadPagedData();
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch { return '-'; }
  };

  const filters: ('All' | LibraryType)[] = ['All', LibraryType.LITERATURE, LibraryType.TASK, LibraryType.PERSONAL, LibraryType.OTHER];
  const tableColumns = [
    { label: 'Title', width: '300px' },
    { label: 'Author(s)', width: '200px' },
    { label: 'Publisher', width: '200px' },
    { label: 'Year', width: '80px' },
    { label: 'Category', width: '150px' },
    { label: 'Topic', width: '150px' },
    { label: 'Sub Topic', width: '150px' },
    { label: 'Created At', width: '150px' },
  ];

  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto no-scrollbar space-y-4 animate-in fade-in duration-500 relative pr-1">
      {selectedItem && <LibraryDetailView item={selectedItem} onClose={() => setSelectedItem(null)} />}

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between shrink-0">
        <SmartSearchBox value={searchQuery} onChange={setSearchQuery} onSearch={handleSearchTrigger} />
        <AddButton onClick={() => navigate('/add')} icon={<PlusIcon className="w-5 h-5" />}>Add Collection</AddButton>
      </div>

      <div className="flex items-center justify-between lg:justify-start gap-4 shrink-0 relative z-[30]">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-2 no-scrollbar flex-1">
          {filters.map(filter => (
            <StandardFilterButton key={filter} isActive={activeFilter === filter} onClick={() => { setActiveFilter(filter); setCurrentPage(1); }}>{filter}</StandardFilterButton>
          ))}
        </div>
      </div>

      <StandardQuickAccessBar isVisible={selectedIds.length > 0} selectedCount={selectedIds.length}>
        <StandardQuickActionButton variant="danger" onClick={handleBatchDelete}><TrashIcon className="w-5 h-5" /></StandardQuickActionButton>
        <StandardQuickActionButton variant="primary" onClick={() => handleBatchAction('isBookmarked')}><BookmarkIcon className="w-5 h-5" /></StandardQuickActionButton>
        <StandardQuickActionButton variant="warning" onClick={() => handleBatchAction('isFavorite')}><StarIcon className="w-5 h-5" /></StandardQuickActionButton>
      </StandardQuickAccessBar>

      <div className="hidden lg:flex flex-col flex-none">
        <StandardTableContainer>
          <StandardTableWrapper>
            <thead className="sticky top-0 z-[50]">
              <tr>
                <th className="sticky left-0 z-[60] px-6 py-4 w-12 bg-gray-50 border-r border-gray-100/50 shadow-sm text-center">
                  <StandardCheckbox onChange={toggleSelectAll} checked={items.length > 0 && selectedIds.length === items.length} />
                </th>
                {tableColumns.map((col, idx) => (
                  <StandardTh key={idx} width={col.width} className={idx === 0 ? 'sticky left-12 z-[55] border-r border-gray-100/50 shadow-sm' : ''}>
                    {col.label}
                  </StandardTh>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLocalLoading ? (
                <TableSkeleton rows={8} />
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-24 text-center text-gray-400 font-bold uppercase tracking-widest">No Collection Found</td></tr>
              ) : (
                items.map((item) => (
                  <StandardTr key={item.id} className="cursor-pointer" onClick={() => setSelectedItem(item)}>
                    <td className="px-6 py-4 sticky left-0 z-20 border-r border-gray-100/50 bg-white group-hover:bg-[#f0f7fa] shadow-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <StandardCheckbox checked={selectedIds.includes(item.id)} onChange={() => toggleSelectItem(item.id)} />
                    </td>
                    <StandardTd className="sticky left-12 z-20 border-r border-gray-100/50 bg-white group-hover:bg-[#f0f7fa] shadow-sm">
                      <ElegantTooltip text={item.title}>
                        <div className="flex items-start gap-2 group/title">
                          <div className="shrink-0 mt-0.5">
                            {item.addMethod === 'FILE' ? <DocumentIcon className="w-4 h-4 text-[#004A74]" /> : <LinkIcon className="w-4 h-4 text-[#560D96]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-bold text-[#004A74] line-clamp-2 leading-snug">{item.title}</span>
                          </div>
                          <div className="flex gap-1 shrink-0 mt-1">
                            {item.isBookmarked && <BookmarkSolid className="w-3 h-3 text-[#004A74]" />}
                            {item.isFavorite && <StarSolid className="w-3 h-3 text-[#FED400]" />}
                          </div>
                          <EyeIcon className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-all mt-1" />
                        </div>
                      </ElegantTooltip>
                    </StandardTd>
                    <StandardTd className="text-xs text-gray-600 italic text-center"><ElegantTooltip text={item.author}><div className="line-clamp-2">{item.author || '-'}</div></ElegantTooltip></StandardTd>
                    <StandardTd className="text-xs text-gray-600 text-center"><ElegantTooltip text={item.publisher}><div className="line-clamp-2">{item.publisher || '-'}</div></ElegantTooltip></StandardTd>
                    <StandardTd className="text-xs text-gray-600 font-mono text-center">{item.year || '-'}</StandardTd>
                    <StandardTd className="text-xs text-gray-600 text-center">{item.category || '-'}</StandardTd>
                    <StandardTd className="text-xs text-gray-600 text-center">{item.topic || '-'}</StandardTd>
                    <StandardTd className="text-xs text-gray-600 text-center">{item.subTopic || '-'}</StandardTd>
                    <StandardTd className="text-xs font-medium text-gray-400 whitespace-nowrap text-center">{formatDateTime(item.createdAt)}</StandardTd>
                  </StandardTr>
                ))
              )}
            </tbody>
          </StandardTableWrapper>
          <StandardTableFooter 
            totalItems={totalCount} 
            currentPage={currentPage} 
            itemsPerPage={itemsPerPage} 
            totalPages={Math.ceil(totalCount / itemsPerPage)} 
            onPageChange={setCurrentPage} 
          />
        </StandardTableContainer>
      </div>

      {/* Grid View (Mobile) */}
      <div className="lg:hidden flex-none pb-10">
        <StandardGridContainer>
          {isLocalLoading ? (
            [...Array(6)].map((_, i) => <div key={i} className="h-60 skeleton rounded-3xl" />)
          ) : items.map((item) => (
            <StandardItemCard key={item.id} isSelected={selectedIds.includes(item.id)} onClick={() => setSelectedItem(item)}>
               <div className="flex items-center gap-3 mb-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => toggleSelectItem(item.id)} className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${selectedIds.includes(item.id) ? 'bg-[#004A74] border-[#004A74] text-white' : 'bg-white border-gray-200'}`}>
                  {selectedIds.includes(item.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                </button>
                <span className="text-[8px] font-black uppercase tracking-widest bg-[#004A74] text-white px-2 py-0.5 rounded-full line-clamp-2">{item.category || 'GENERAL'}</span>
              </div>
              <h3 className="text-sm font-bold text-[#004A74] line-clamp-2 mb-2">{item.title}</h3>
              <p className="text-xs italic text-gray-500 line-clamp-1 mb-4">{item.author || '-'}</p>
              <div className="mt-auto flex justify-between items-center text-[10px] font-bold text-gray-400">
                <span>{item.year || '-'}</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            </StandardItemCard>
          ))}
        </StandardGridContainer>
        {totalCount > itemsPerPage && (
          <div className="pt-8">
            <StandardTableFooter 
              totalItems={totalCount} 
              currentPage={currentPage} 
              itemsPerPage={itemsPerPage} 
              totalPages={Math.ceil(totalCount / itemsPerPage)} 
              onPageChange={setCurrentPage} 
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryMain;
