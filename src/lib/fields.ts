// Beschreibung von Eingabefeldern – gemeinsam für den Aufgabenbereich und Dialoge
export type FieldType =
  | 'text' | 'textarea' | 'password' | 'number' | 'select' | 'seg' | 'check' | 'color' | 'range'
  | 'pages' | 'doc' | 'docs' | 'files' | 'quad' | 'note' | 'position' | 'heading' | 'custom';

export interface Field {
  key: string;
  type: FieldType;
  label?: string;
  def?: any;
  opts?: [string, string][];
  min?: number; max?: number; step?: number; unit?: string;
  hint?: string;
  ph?: string;
  accept?: string[];
  /** Feld nur zeigen, wenn die Bedingung für die aktuellen Werte gilt */
  when?: (v: Record<string, any>) => boolean;
  /** Für "quad": Teilfelder */
  parts?: [string, string][];
  /** Für "pages": Vorgabe ('all' | 'sel' | 'cur') */
  scope?: 'all' | 'sel' | 'cur';
  text?: string;
  tone?: 'info' | 'warn';
  required?: boolean;
  component?: any;
}

export interface PagesValue { mode: 'all' | 'cur' | 'sel' | 'range' | 'odd' | 'even'; range: string }

export function defaults(fields: Field[] = []) {
  const v: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === 'pages') v[f.key] = { mode: f.scope || 'all', range: '' } as PagesValue;
    else if (f.type === 'quad') v[f.key] = { ...(f.def || {}) };
    else if (f.type === 'docs') v[f.key] = [...(f.def || [])];
    else if (f.def !== undefined) v[f.key] = f.def;
  }
  return v;
}
