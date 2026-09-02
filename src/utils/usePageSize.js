import { useState, useEffect, useContext } from 'react';
import { RoleContext } from '../context/RoleContext';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function usePageSize(pageKey, defaultSize = 10) {
  const { authUser } = useContext(RoleContext) || {};
  const username = authUser?.username ? authUser.username.toLowerCase() : 'global';
  const storageKey = `page_size_${username}_${pageKey}`;

  const [pageSize, setPageSizeState] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const num = parseInt(saved, 10);
    return PAGE_SIZE_OPTIONS.includes(num) ? num : defaultSize;
  });

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const num = parseInt(saved, 10);
    if (PAGE_SIZE_OPTIONS.includes(num)) {
      setPageSizeState(num);
    }
  }, [storageKey]);

  const setPageSize = (newSize) => {
    const val = Number(newSize);
    if (PAGE_SIZE_OPTIONS.includes(val)) {
      setPageSizeState(val);
      localStorage.setItem(storageKey, val.toString());
    }
  };

  return [pageSize, setPageSize];
}
