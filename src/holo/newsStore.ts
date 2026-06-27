// newsStore.ts — Global mutable state for the floating News Carousel (like store.ts for Music)
// Written by NewsApp (loader), read inside R3F Canvas by NewsCarousel

export interface NewsItem {
  id: string;
  title: string;
  kategori: string;
  analisa: string;
  link: string;
  pubDate: string;
  source: string;
  savedAt: string;
}

// Carousel rig — mutated in useFrame, no React re-render needed
export const newsRig = { rotY: 0, targetRotY: 0 };
export const newsPlayer = { focusIndex: 0 };

// Data store — written by NewsApp (outside Canvas), read by NewsCarousel (inside Canvas)
export const newsStore = {
  items: [] as NewsItem[],
  loading: false,
  error: null as string | null,
};

// Simple pub/sub — notifies HoloPlayer when items change so it can pass them as props
const subs = new Set<() => void>();
export const newsEvents = {
  emit: () => subs.forEach(f => f()),
  sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
};

// Wrap angle into [-π, π]
export function wrapN(a: number) {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}

// Helpers shared between NewsCarousel and NewsApp
export function accentOfNews(kategori = '') {
  const k = kategori.toLowerCase();
  if (k.includes('saham') || k.includes('idx')) return '#22c55e';
  if (k.includes('nilai') || k.includes('kurs') || k.includes('tukar')) return '#a855f7';
  return '#f97316';
}
export function emojiOfNews(kategori = '') {
  const k = kategori.toLowerCase();
  if (k.includes('saham') || k.includes('idx')) return '📈';
  if (k.includes('nilai') || k.includes('kurs') || k.includes('tukar')) return '💵';
  return '📰';
}
export function fmtDateShort(s: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); }
  catch { return s.slice(0, 10); }
}
export function cleanAnalisa(raw: string) {
  return raw.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').replace(/#{1,4}\s*/g, '').trim().slice(0, 220);
}
