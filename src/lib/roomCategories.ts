import type { RoomType } from './types';

export const ROOM_CATEGORIES: Record<number, { type: RoomType; label: string; color: string; stroke: string }> = {
  0: { type: 'living', label: 'Living Room', color: '#76d7ff', stroke: '#0096ff' },
  1: { type: 'dining', label: 'Dining Room', color: '#ffe45c', stroke: '#ffb703' },
  2: { type: 'master_bedroom', label: 'Master Bedroom', color: '#bba5ff', stroke: '#7c3aed' },
  3: { type: 'bedroom', label: 'Bedroom', color: '#ff8cc6', stroke: '#ec4899' },
  4: { type: 'kitchen', label: 'Kitchen', color: '#67e8b4', stroke: '#10b981' },
  5: { type: 'bathroom', label: 'Bathroom', color: '#5eead4', stroke: '#14b8a6' },
  6: { type: 'balcony', label: 'Balcony', color: '#b5f45b', stroke: '#65a30d' },
  7: { type: 'service_balcony', label: 'Service Balcony', color: '#8ef6d2', stroke: '#0f9f76' },
  8: { type: 'walk_in_closet', label: 'Walk-in Closet', color: '#d8b4fe', stroke: '#9333ea' },
  9: { type: 'storage', label: 'Storage', color: '#cbd5e1', stroke: '#64748b' },
  10: { type: 'corridor', label: 'Corridor', color: '#f8a5ff', stroke: '#c026d3' },
  11: { type: 'entry', label: 'Entry', color: '#ffbd7a', stroke: '#f97316' },
  12: { type: 'study', label: 'Study', color: '#93c5fd', stroke: '#2563eb' },
  13: { type: 'elevator_hall', label: 'Elevator Hall', color: '#e2e8f0', stroke: '#475569' },
  14: { type: 'garage', label: 'Garage', color: '#fca5a5', stroke: '#ef4444' },
  15: { type: 'stair', label: 'Stair', color: '#d4d4d8', stroke: '#71717a' },
  16: { type: 'outdoor', label: 'Outdoor', color: '#bef264', stroke: '#84cc16' },
  [-1]: { type: 'unknown', label: 'Unknown', color: '#f1f5f9', stroke: '#94a3b8' },
};

export function roomCategoryForType(type: RoomType): number {
  const entry = Object.entries(ROOM_CATEGORIES).find(([, value]) => value.type === type);
  return entry ? Number(entry[0]) : -1;
}
