// Modale Dialoge als Promise
import type { Field } from './fields';

import { L } from './i18n';
export interface DialogButton { label: string; value: string; primary?: boolean; danger?: boolean }
export interface DialogSpec {
  title: string;
  message?: string;
  detail?: string;
  fields?: Field[];
  values?: Record<string, any>;
  buttons?: DialogButton[];
  component?: any;
  props?: Record<string, any>;
  width?: number;
  icon?: 'warn' | 'info' | 'lock' | 'question';
}
export interface DialogResult { button: string; values: Record<string, any> }
interface Entry { id: number; spec: DialogSpec; resolve: (r: DialogResult | null) => void }

export const dialogs = $state({ list: [] as Entry[] });
let seq = 0;

export function dialog(spec: DialogSpec): Promise<DialogResult | null> {
  return new Promise(resolve => {
    dialogs.list.push({ id: ++seq, spec, resolve });
  });
}
export function closeDialog(id: number, r: DialogResult | null) {
  const i = dialogs.list.findIndex(e => e.id === id);
  if (i < 0) return;
  const [e] = dialogs.list.splice(i, 1);
  e.resolve(r);
}

export async function confirm(title: string, message: string, ok = 'OK', opts: { danger?: boolean; cancel?: string; detail?: string } = {}) {
  const r = await dialog({ title, message, detail: opts.detail, icon: opts.danger ? 'warn' : 'question', buttons: [{ label: opts.cancel || L("Abbrechen"), value: 'cancel' }, { label: ok, value: 'ok', primary: !opts.danger, danger: opts.danger }] });
  return r?.button === 'ok';
}

export async function askPassword(name: string, retry: boolean): Promise<string | null> {
  const r = await dialog({
    title: L("Passwort erforderlich"), icon: 'lock',
    message: L("„{0}“ ist durch ein Passwort geschützt.", name),
    detail: retry ? L("Das eingegebene Passwort war nicht richtig.") : undefined,
    fields: [{ key: 'pw', type: 'password', label: L("Passwort") }],
    buttons: [{ label: L("Abbrechen"), value: 'cancel' }, { label: L("Öffnen"), value: 'ok', primary: true }],
  });
  return r && r.button === 'ok' ? (r.values.pw ?? '') : null;
}
