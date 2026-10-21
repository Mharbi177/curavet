/**
 * CuraVet embeddable chat widget (Phase 4.3).
 *
 * Deliberately framework-free: salon sites are WordPress, Wix and Squarespace
 * alike, so the widget ships as a single IIFE with zero dependencies that only
 * needs a `<script>` tag and a `?key=` query parameter.
 *
 *   <script src="https://api.curavet.io/widget/widget.js?key=wgt_abc123"></script>
 *
 * Everything is namespaced under `gb-`, injected styles are prefixed, and the
 * widget lazy-initialises so it never blocks the host page.
 */

export interface WidgetService {
  id: string;
  nameEn: string;
  nameAr: string;
  price: number;
  currency: string;
}

export interface WidgetConfig {
  tenantId: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  welcomeMessage: string;
  language: string;
  services: WidgetService[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface WidgetState {
  config: WidgetConfig | null;
  messages: ChatMessage[];
  sessionId: string;
  sending: boolean;
  root: HTMLElement | null;
}

const scriptEl = document.currentScript as HTMLScriptElement | null;

// `?key=` identifies the tenant; `data-api` lets a salon point at a staging API.
const key = new URLSearchParams(scriptEl?.src.split('?')[1] ?? '').get('key');
const API_BASE = scriptEl?.dataset.api || (scriptEl?.src ? new URL(scriptEl.src).origin : '');

const SESSION_KEY = `curavet_session_${key ?? 'default'}`;
const OPEN_KEY = `curavet_open_${key ?? 'default'}`;

export const state: WidgetState = {
  config: null,
  messages: [],
  sessionId: '',
  sending: false,
  root: null,
};

function uid(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sessionId(): string {
  if (state.sessionId) return state.sessionId;
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(SESSION_KEY, id);
    }
    state.sessionId = id;
    return id;
  } catch {
    // Private browsing with storage disabled: keep an in-memory session.
    state.sessionId ||= uid();
    return state.sessionId;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

const RTL_LANGUAGES = new Set(['ar', 'ur', 'fa', 'he']);

// ── Styles ──────────────────────────────────────────────────────────────────
const STYLE_ID = 'curavet-widget-styles';

const CSS = `
/* ── CuraVet Widget — Professional Neutral Theme ── */
.gb-root{
  position:fixed;bottom:24px;right:24px;z-index:2147483000;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  line-height:1.5;-webkit-font-smoothing:antialiased;
}
.gb-root[dir="rtl"]{right:auto;left:24px}

/* ── Launcher button ── */
.gb-launcher{
  width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;
  box-shadow:0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);
  display:flex;align-items:center;justify-content:center;
  transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;
}
.gb-launcher:hover{transform:scale(1.08);box-shadow:0 12px 40px rgba(0,0,0,.24)}
.gb-launcher:active{transform:scale(.96)}
.gb-launcher svg{width:26px;height:26px;fill:#fff}

/* ── Chat panel ── */
.gb-panel{
  position:absolute;bottom:70px;
  width:370px;max-width:calc(100vw - 32px);
  height:540px;max-height:calc(100vh - 110px);
  background:#fff;border-radius:18px;
  box-shadow:0 24px 64px rgba(0,0,0,.18),0 4px 16px rgba(0,0,0,.06);
  display:flex;flex-direction:column;overflow:hidden;
  opacity:0;transform:translateY(16px) scale(.97);
  pointer-events:none;
  transition:opacity .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1);
}
.gb-root.gb-open .gb-panel{opacity:1;transform:none;pointer-events:auto}

/* ── Header ── */
.gb-header{
  padding:14px 16px;color:#fff;
  display:flex;align-items:center;gap:10px;flex-shrink:0;
  box-shadow:0 1px 0 rgba(0,0,0,.1);
}
.gb-header img{width:34px;height:34px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,.2);box-shadow:0 0 0 2px rgba(255,255,255,.3)}
.gb-avatar{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);box-shadow:0 0 0 2px rgba(255,255,255,.3);flex-shrink:0}
.gb-header strong{display:block;font-size:14px;font-weight:600;letter-spacing:-.01em}
.gb-header .gb-status{font-size:11px;opacity:.9;display:flex;align-items:center;gap:4px;margin-top:1px}
.gb-dot{width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;box-shadow:0 0 0 2px rgba(74,222,128,.25)}
.gb-close{
  margin-inline-start:auto;background:transparent;border:0;
  color:rgba(255,255,255,.8);font-size:20px;line-height:1;
  cursor:pointer;padding:4px;border-radius:6px;
  transition:background .15s,color .15s;
}
.gb-close:hover{background:rgba(255,255,255,.15);color:#fff}

/* ── Message body ── */
.gb-body{
  flex:1;overflow-y:auto;padding:16px 14px;
  background:#f8f9fb;
  display:flex;flex-direction:column;gap:8px;
  scrollbar-width:thin;scrollbar-color:#e2e8f0 transparent;
}
.gb-body::-webkit-scrollbar{width:4px}
.gb-body::-webkit-scrollbar-track{background:transparent}
.gb-body::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}

/* ── Message bubbles ── */
.gb-msg{
  max-width:80%;padding:9px 13px;border-radius:16px;
  font-size:13.5px;white-space:pre-wrap;word-break:break-word;
  animation:gb-msg-in .18s ease;
}
@keyframes gb-msg-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.gb-msg.gb-assistant{
  align-self:flex-start;background:#fff;
  border:1px solid #e8ecf0;
  box-shadow:0 1px 3px rgba(0,0,0,.06);
  color:#1e293b;border-bottom-left-radius:4px;
}
.gb-msg.gb-user{
  align-self:flex-end;color:#fff;
  border-bottom-right-radius:4px;
}

/* ── Typing indicator ── */
.gb-typing{
  align-self:flex-start;background:#fff;
  border:1px solid #e8ecf0;border-radius:16px;border-bottom-left-radius:4px;
  padding:11px 14px;display:flex;gap:4px;
  box-shadow:0 1px 3px rgba(0,0,0,.06);
}
.gb-typing i{width:5px;height:5px;border-radius:50%;background:#94a3b8;animation:gb-bounce 1.2s infinite}
.gb-typing i:nth-child(2){animation-delay:.16s}
.gb-typing i:nth-child(3){animation-delay:.32s}
@keyframes gb-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

/* ── Service chips ── */
.gb-services{
  padding:8px 12px 10px;display:flex;flex-wrap:wrap;gap:6px;
  background:#fff;border-top:1px solid #f0f2f5;
}
.gb-chip{
  font-size:12px;font-weight:500;padding:5px 11px;border-radius:999px;
  border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;
  color:#475569;transition:background .15s,border-color .15s,color .15s;
}
.gb-chip:hover{background:#f1f5f9;border-color:#cbd5e1;color:#1e293b}

/* ── Input form ── */
.gb-form{
  padding:10px 12px;border-top:1px solid #f0f2f5;
  display:flex;gap:8px;background:#fff;flex-shrink:0;
  align-items:center;
}
.gb-form input{
  flex:1;border:1.5px solid #e2e8f0;border-radius:999px;
  padding:9px 16px;font-size:13.5px;outline:none;
  color:#1e293b;background:#f8fafc;
  transition:border-color .15s,background .15s;
}
.gb-form input:focus{border-color:#94a3b8;background:#fff}
.gb-form input::placeholder{color:#94a3b8}
.gb-form button{
  width:38px;height:38px;border:0;border-radius:50%;color:#fff;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:opacity .15s,transform .15s;
  box-shadow:0 2px 8px rgba(0,0,0,.15);
}
.gb-form button:hover:not(:disabled){opacity:.9;transform:scale(1.05)}
.gb-form button:disabled{opacity:.5;cursor:not-allowed}
.gb-form svg{width:16px;height:16px;fill:currentColor}

/* ── Error banner ── */
.gb-error{
  margin:0 12px 10px;padding:8px 12px;border-radius:10px;
  background:#fef2f2;border:1px solid #fecaca;
  color:#b91c1c;font-size:12px;
}
.gb-error:empty{display:none}

@media(max-width:480px){
  .gb-root{bottom:16px;right:16px}
  .gb-panel{width:calc(100vw - 24px);height:calc(100vh - 120px)}
}
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = el('style', { id: STYLE_ID });
  style.textContent = CSS;
  document.head.appendChild(style);
}

const ICON_CHAT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 3 6.6 3 11c0 2.4 1.2 4.5 3.1 5.9L5 21l4.3-2.1c.9.2 1.8.3 2.7.3 5.1 0 9-3.6 9-8s-3.9-8.2-9-8.2z"/></svg>';

const ICON_SEND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5l19-8.5L3 3.5 3 10l12 2-12 2z"/></svg>';


// ── Rendering ───────────────────────────────────────────────────────────────
function renderMessages(body: HTMLElement): void {
  body.textContent = '';
  for (const message of state.messages) {
    body.appendChild(el('div', { class: `gb-msg gb-${message.role}` }, message.text));
  }
  body.scrollTop = body.scrollHeight;
}

function showTyping(body: HTMLElement, on: boolean): void {
  const existing = body.querySelector('.gb-typing');
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  body.appendChild(el('div', { class: 'gb-typing' }, el('i'), el('i'), el('i')));
  body.scrollTop = body.scrollHeight;
}

async function send(
  text: string,
  body: HTMLElement,
  error: HTMLElement,
  input: HTMLInputElement
): Promise<void> {
  const trimmed = text.trim();
  if (state.sending || !trimmed || !state.config) return;

  state.sending = true;
  error.textContent = '';
  state.messages.push({ role: 'user', text: trimmed });
  renderMessages(body);
  input.value = '';
  showTyping(body, true);

  try {
    const response = await fetch(`${API_BASE}/api/public/widget/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, sessionId: sessionId(), message: trimmed }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || 'The assistant is unavailable right now.');
    }

    if (data?.reply) {
      state.messages.push({ role: 'assistant', text: data.reply });
    }
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : 'Something went wrong.';
  } finally {
    showTyping(body, false);
    renderMessages(body);
    state.sending = false;
  }
}

function isOpen(): boolean {
  return state.root?.classList.contains('gb-open') ?? false;
}

function setOpen(open: boolean): void {
  state.root?.classList.toggle('gb-open', open);
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* storage unavailable — non-fatal */
  }
}


function build(config: WidgetConfig): HTMLElement {
  const rtl = isRtl(config.language);

  const body = el('div', { class: 'gb-body' });
  const error = el('div', { class: 'gb-error' });

  const input = el('input', {
    type: 'text',
    placeholder: rtl ? 'اكتب رسالتك…' : 'Type a message…',
    'aria-label': 'Message',
    autocomplete: 'off',
  }) as HTMLInputElement;

  const sendBtn = el('button', { type: 'submit', 'aria-label': 'Send' });
  sendBtn.innerHTML = ICON_SEND;
  sendBtn.style.background = config.primaryColor;

  const form = el('form', { class: 'gb-form' }, input, sendBtn);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void send(input.value, body, error, input);
  });

  const brand = config.logoUrl
    ? el('img', { src: config.logoUrl, alt: '' })
    : el('div', { class: 'gb-avatar' });

  const close = el('button', { class: 'gb-close', 'aria-label': 'Close chat' }, '×');
  close.addEventListener('click', () => setOpen(false));

  const header = el(
    'div',
    { class: 'gb-header' },
    brand,
    el(
      'div',
      {},
      el('strong', {}, config.name),
      el('span', { class: 'gb-status' }, el('i', { class: 'gb-dot' }), 'Online')
    ),
    close
  );
  header.style.background = config.primaryColor;

  const launcher = el('button', { class: 'gb-launcher', 'aria-label': 'Open chat' });
  launcher.innerHTML = ICON_CHAT;
  launcher.style.background = config.primaryColor;
  launcher.addEventListener('click', () => setOpen(!isOpen()));

  const panel = el('div', { class: 'gb-panel' }, header, body);

  // Quick-reply chips remove the cold-start friction for first-time visitors.
  if (config.services.length > 0) {
    const chips = el('div', { class: 'gb-services' });
    for (const service of config.services.slice(0, 4)) {
      const label = rtl ? service.nameAr : service.nameEn;
      const chip = el(
        'button',
        { class: 'gb-chip', type: 'button' },
        `${label} · ${service.price} ${service.currency}`
      );
      chip.addEventListener('click', () => {
        input.value = rtl ? `أريد حجز ${label}` : `I'd like to book ${label}`;
        input.focus();
      });
      chips.appendChild(chip);
    }
    panel.appendChild(chips);
  }

  panel.appendChild(error);
  panel.appendChild(form);

  const root = el('div', { class: 'gb-root' }, panel, launcher);
  if (rtl) root.setAttribute('dir', 'rtl');

  state.messages = [{ role: 'assistant', text: config.welcomeMessage }];
  renderMessages(body);

  return root;
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  if (!key) {
    console.warn('[CuraVet] widget requires ?key=<tenant widget key>');
    return;
  }
  if (document.querySelector('.gb-root')) return;

  injectStyles();

  try {
    const response = await fetch(
      `${API_BASE}/api/public/widget/config?key=${encodeURIComponent(key)}`
    );
    if (!response.ok) throw new Error(`config responded ${response.status}`);
    state.config = (await response.json()) as WidgetConfig;
  } catch (error) {
    console.warn('[CuraVet] widget failed to load configuration', error);
    return;
  }

  sessionId();
  state.root = build(state.config);
  document.body.appendChild(state.root);

  try {
    if (localStorage.getItem(OPEN_KEY) === '1') setOpen(true);
  } catch {
    /* ignore storage failures */
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}

export { init, send, build, injectStyles };

export const isRtl = (lang: string): boolean => RTL_LANGUAGES.has(lang);
