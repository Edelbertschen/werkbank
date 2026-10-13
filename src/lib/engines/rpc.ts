import { L } from '../i18n';
// Minimales Anfrage/Antwort-Protokoll zwischen Oberfläche und Engine-Workern.
export type Progress = (p: number, msg?: string) => void;

interface Pending { res: (v: any) => void; rej: (e: any) => void; progress?: Progress }

export class WorkerClient {
  private w: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  constructor(private factory: () => Worker, private name: string) {}

  private get worker() {
    if (!this.w) {
      this.w = this.factory();
      this.w.onmessage = ({ data }) => {
        const p = this.pending.get(data.id);
        if (!p) return;
        if ('progress' in data) { p.progress?.(data.progress, data.msg); return; }
        this.pending.delete(data.id);
        data.error ? p.rej(Object.assign(new Error(data.error), { engine: this.name })) : p.res(data.result);
      };
      this.w.onerror = e => {
        const err = new Error(`${this.name}: ${e.message || L("Worker-Fehler")}`);
        for (const p of this.pending.values()) p.rej(err);
        this.pending.clear();
        this.w?.terminate(); this.w = null;
      };
    }
    return this.w;
  }

  get started() { return !!this.w; }

  call<T = any>(op: string, payload?: any, opts: { transfer?: Transferable[]; progress?: Progress } = {}): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((res, rej) => {
      this.pending.set(id, { res, rej, progress: opts.progress });
      this.worker.postMessage({ id, op, payload }, opts.transfer || []);
    });
  }

  /** Worker beenden (z. B. um Speicher freizugeben oder eine Endlosschleife abzubrechen) */
  reset() {
    this.w?.terminate(); this.w = null;
    for (const p of this.pending.values()) p.rej(new Error(L("Abgebrochen")));
    this.pending.clear();
  }
}

/** Worker-Seite */
export function serve(handlers: Record<string, (payload: any, progress: Progress) => Promise<any>>) {
  const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);
  self.onmessage = async ({ data }: MessageEvent) => {
    const { id, op, payload } = data;
    const progress: Progress = (p, msg) => post({ id, progress: p, msg });
    try {
      const h = handlers[op];
      if (!h) throw new Error(L("Unbekannte Operation ") + op);
      const result = await h(payload, progress);
      post({ id, result }, collectTransfer(result));
    } catch (e: any) {
      post({ id, error: cleanError(e) });
    }
  };
}

function cleanError(e: any): string {
  const s = String(e?.message || e || L("Fehler"));
  // Python-Tracebacks auf die letzte, aussagekräftige Zeile kürzen
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  const last = [...lines].reverse().find(l => /Error|Exception|error:/i.test(l));
  return (last || lines[lines.length - 1] || s).replace(/^\w+(Error|Exception):\s*/, '').slice(0, 400);
}

function collectTransfer(v: any, out: Transferable[] = [], seen = new Set()): Transferable[] {
  if (!v || typeof v !== 'object' || seen.has(v)) return out;
  seen.add(v);
  if (v instanceof Uint8Array) { if (!out.includes(v.buffer as ArrayBuffer)) out.push(v.buffer as ArrayBuffer); return out; }
  if (Array.isArray(v)) v.forEach(x => collectTransfer(x, out, seen));
  else if (v.constructor === Object) Object.values(v).forEach(x => collectTransfer(x, out, seen));
  return out;
}
