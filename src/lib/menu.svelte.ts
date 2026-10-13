// Kontextmenü (eines zur Zeit)
export interface MenuItem { label: string; icon?: any; run?: () => void; danger?: boolean; disabled?: boolean; sep?: boolean; shortcut?: string }
export const menu = $state({ open: false, x: 0, y: 0, items: [] as MenuItem[] });
export function showMenu(e: MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  menu.items = items; menu.x = e.clientX; menu.y = e.clientY; menu.open = true;
}
export function closeMenu() { menu.open = false; }
