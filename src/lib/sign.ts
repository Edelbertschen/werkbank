// Digitale Signaturen (PAdES/PKCS#7) mit zgapdfsigner und node-forge
import * as PDFLib from 'pdf-lib';
import forge from 'node-forge';
import { httpFetch } from './platform';

import { L, intlLocale } from './i18n';
let zgaP: Promise<any> | null = null;
async function zga() {
  return (zgaP ??= (async () => {
    (globalThis as any).PDFLib = PDFLib;
    (globalThis as any).forge = forge;
    await import('zgapdfsigner/dist/zgapdfsigner.min.js' as any);
    const Z = (globalThis as any).Zga;
    if (!Z) throw new Error(L("Signaturbibliothek nicht geladen"));
    // Netzwerkzugriffe (Zeitstempel, OCSP, Zertifikatsketten) über die App statt über fetch
    Z.urlFetch = async (url: string, params?: { method?: string; payload?: any; headers?: Record<string, string> }) => {
      const ctype = params?.headers?.['Content-Type'] || params?.headers?.['content-type'];
      let body: Uint8Array | undefined;
      if (params?.payload != null) body = typeof params.payload === 'string' ? Uint8Array.from(params.payload, c => c.charCodeAt(0) & 0xff) : new Uint8Array(params.payload);
      return httpFetch(url, { method: params?.method || (body ? 'POST' : 'GET'), body, contentType: ctype });
    };
    return Z;
  })());
}

export interface CertInfo { cn: string; org?: string; email?: string; issuer: string; validTo: Date; validFrom: Date; selfSigned: boolean }

/** Zertifikat öffnen und Angaben lesen (prüft dabei das Passwort) */
export function readP12(p12: Uint8Array, password: string): CertInfo {
  let bin = '';
  for (let i = 0; i < p12.length; i++) bin += String.fromCharCode(p12[i]);
  let p: forge.pkcs12.Pkcs12Pfx;
  try { p = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), password); }
  catch (e: any) { throw new Error(/Invalid password|MAC/i.test(String(e?.message)) ? L("Das Zertifikatspasswort ist falsch") : L("Die Zertifikatsdatei ist nicht lesbar")); }
  const bags = p.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const cert = bags.map(b => b.cert!).find(Boolean);
  if (!cert) throw new Error(L("Kein Zertifikat in der Datei"));
  const f = (o: any, k: string) => o.getField(k)?.value as string | undefined;
  return { cn: f(cert.subject, 'CN') || '—', org: f(cert.subject, 'O'), email: f(cert.subject, 'E') || f(cert.subject, 'emailAddress'), issuer: f(cert.issuer, 'CN') || f(cert.issuer, 'O') || '—', validFrom: cert.validity.notBefore, validTo: cert.validity.notAfter, selfSigned: cert.isIssuer(cert) };
}

export interface SignOptions {
  p12: Uint8Array;
  password: string;
  reason?: string;
  location?: string;
  contact?: string;
  /** DocMDP: 0 = keine Einschränkung, 1 = keine Änderungen, 2 = Formulare & Signaturen, 3 = zusätzlich Kommentare */
  permission?: 0 | 1 | 2 | 3;
  tsa?: string;
  ltv?: boolean;
  visible?: { page: number; x: number; y: number; w: number; h: number; png: Uint8Array };
}

export async function signPdf(pdf: Uint8Array, o: SignOptions): Promise<Uint8Array> {
  const Z = await zga();
  const sopt: any = { p12cert: o.p12.buffer.slice(o.p12.byteOffset, o.p12.byteOffset + o.p12.byteLength), pwd: o.password, reason: o.reason || undefined, location: o.location || undefined, contact: o.contact || undefined };
  if (o.permission) sopt.permission = o.permission;
  if (o.tsa) sopt.signdate = { url: o.tsa };
  if (o.ltv) sopt.ltv = 1;
  if (o.visible) {
    sopt.drawinf = {
      area: { x: o.visible.x, y: o.visible.y, w: o.visible.w, h: o.visible.h },
      pageidx: o.visible.page,
      imgInfo: { imgData: o.visible.png.buffer.slice(o.visible.png.byteOffset, o.visible.png.byteOffset + o.visible.png.byteLength), imgType: 'png' },
    };
  }
  const signer = new Z.PdfSigner(sopt);
  const out = await signer.sign(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength));
  return new Uint8Array(out);
}

/** Selbstsigniertes Zertifikat erzeugen (für interne Freigaben oder Tests) */
export function createSelfSigned(o: { name: string; email?: string; org?: string; years: number; password: string }): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 3072, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(9));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(); cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + o.years);
  const attrs: any[] = [{ name: 'commonName', value: o.name }];
  if (o.org) attrs.push({ name: 'organizationName', value: o.org });
  if (o.email) attrs.push({ name: 'emailAddress', value: o.email });
  attrs.push({ name: 'countryName', value: 'DE' });
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', emailProtection: true, codeSigning: false },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], o.password, { algorithm: '3des', friendlyName: o.name });
  const der = forge.asn1.toDer(p12).getBytes();
  return Uint8Array.from(der, c => c.charCodeAt(0));
}

/** Erscheinungsbild der sichtbaren Signatur als PNG */
export async function signatureAppearance(o: { name: string; reason?: string; location?: string; date: Date; image?: string; w: number; h: number }): Promise<Uint8Array> {
  const S = 4;
  const c = document.createElement('canvas'); c.width = Math.round(o.w * S); c.height = Math.round(o.h * S);
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(255,255,255,0)'; x.fillRect(0, 0, c.width, c.height);
  let left = 6 * S;
  if (o.image) {
    const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = o.image!; });
    const ih = c.height - 8 * S, iw = Math.min(c.width * 0.45, ih * im.width / im.height);
    x.drawImage(im, 4 * S, (c.height - iw * im.height / im.width) / 2, iw, iw * im.height / im.width);
    left = iw + 10 * S;
  }
  x.strokeStyle = '#1F4FD1'; x.lineWidth = 1.2 * S; x.beginPath(); x.moveTo(left - 4 * S, 4 * S); x.lineTo(left - 4 * S, c.height - 4 * S); x.stroke();
  x.fillStyle = '#1C1C1E';
  const lines: [string, number, string][] = [
    [L("Digital signiert von"), 7, '#555'],
    [o.name, 10, '#111'],
    [L("Datum: {0}", o.date.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })), 7, '#333'],
  ];
  if (o.reason) lines.push([L("Grund: {0}", o.reason), 7, '#333']);
  if (o.location) lines.push([L("Ort: {0}", o.location), 7, '#333']);
  const total = lines.reduce((a, l) => a + l[1] * 1.3, 0);
  const fit = Math.min(1, (o.h - 6) / total);
  let y = (c.height - total * fit * S) / 2;
  for (const [t, size, col] of lines) {
    const fs = size * fit * S; y += fs * 1.05;
    x.fillStyle = col; x.font = `${size >= 10 ? 600 : 400} ${fs}px -apple-system, "Segoe UI", "Inter Variable", Arial, sans-serif`;
    let s = t; while (x.measureText(s).width > c.width - left - 4 * S && s.length > 4) s = s.slice(0, -2) + '…';
    x.fillText(s, left, y); y += fs * 0.25;
  }
  const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export { extractSignatures, validateSignature, countSignatures } from './vendor/validate-signature';
