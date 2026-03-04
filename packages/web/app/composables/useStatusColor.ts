import type { IndexStatusResponse } from '~/types/api';

type StatusBadgeColor = 'success' | 'info' | 'error' | 'neutral';

export function useStatusColor() {
  function statusColor(status?: IndexStatusResponse['status']): StatusBadgeColor {
    switch (status) {
      case 'indexed': return 'success';
      case 'indexing': return 'info';
      case 'error': return 'error';
      default: return 'neutral';
    }
  }
  return { statusColor };
}
