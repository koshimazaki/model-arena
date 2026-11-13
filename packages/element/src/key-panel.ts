/**
 * <arena-key>: the reader's own Runware API key, kept in their browser.
 *
 * A password-style field; connect checks only the format and length (16-512
 * printable characters, no spaces) and sends nothing. The key lives in memory,
 * or in sessionStorage when "Remember for this tab" is ticked; it is never
 * logged, never put in an attribute, a URL, an event or a record. Only
 * RunwareClient reads it, through `getKey()`, and sends it to api.runware.ai.
 *
 * Once connected it asks Runware for the account balance and shows it;
 * `refreshBalance()` reads it again (hosts call it after a run). Only the
 * number is read from that response.
 *
 * Attributes: `signup-url` (the "Get a key" link), `theme`.
 * Events: `arena-key-change`, detail `{ connected, remembered }` (never the key);
 * `arena-balance-change`, detail `{ balance }` (USD, or null when unknown).
 */
import { RunwareClient, type FetchLike } from "../../../providers/runware-api/client.ts";
import { KeyStore } from "../../../providers/runware-api/key.ts";
import { el } from "./captions.ts";
import { tokens } from "./tokens.ts";

export const KEY_SHAPE = /^[\x21-\x7e]{16,512}$/;
const SIGNUP = "https://runware.ai/";

/** Why a pasted key cannot be right, or null when its shape is fine. */
export function keyProblem(key: string): string | null {
  if (!key) return "Paste your key first.";
  if (/\s/.test(key)) return "A key has no spaces or line breaks.";
  if (key.length < 16) return "That is too short for an API key.";
  if (key.length > 512) return "That is too long for an API key.";
  if (!KEY_SHAPE.test(key)) return "A key uses plain printable characters only.";
  return null;
}

const css = /* css */ `
${tokens}
:host { display: block; color: var(--ma-fg); font: 400 14px/1.5 var(--ma-font); }
* { box-sizing: border-box; }
.panel { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label.field { display: grid; gap: 4px; flex: 1 1 220px; min-width: 0; }
.lbl { font-size: 12px; color: var(--ma-muted); }
input[type="password"] { width: 100%; min-width: 0; font: 13px var(--ma-mono); color: var(--ma-fg); background: var(--ma-input); border: 1px solid var(--ma-line); border-radius: var(--ma-radius); padding: 6px 8px; min-height: 34px; }
button { font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-input); color: var(--ma-fg); padding: 4px 12px; min-height: 34px; }
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); font-weight: 600; }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
.note { font-size: 12px; color: var(--ma-muted); margin: 0; }
.err { font-size: 13px; color: var(--ma-warn); margin: 0; }
.err:empty { display: none; }
.state { font-weight: 600; }
.balance { font: 13px var(--ma-mono); }
.balance:empty { display: none; }
.state::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--ma-ok); }
a { color: var(--ma-fg); }
`;

export class ArenaKey extends HTMLElement {
  static observedAttributes = ["signup-url"];
  private store: KeyStore;
  private root: ShadowRoot;
  private remembered = false;
  private balanceUsd: number | null = null;
  private balanceNote = "";
  private asked = 0;
  /** Test seam: the fetch the balance call uses. */
  fetch?: FetchLike;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.store = new KeyStore();
    // A key remembered for this tab comes back after a reload; a bad one is dropped.
    const kept = this.store.get();
    if (kept && keyProblem(kept)) this.store.clear();
    this.remembered = Boolean(this.store.get());
  }

  connectedCallback() {
    this.render();
    if (this.connected && this.balanceUsd === null) void this.refreshBalance();
  }

  /** The balance last read from Runware, in USD; null until known. */
  get balance(): number | null {
    return this.balanceUsd;
  }

  /** Reads the balance again. Resolves to the number, or null when it cannot be read. */
  async refreshBalance(): Promise<number | null> {
    const turn = ++this.asked;
    if (!this.connected) return null;
    let value: number | null = null;
    let note = "";
    try {
      value = await new RunwareClient({ getKey: this.getKey, fetch: this.fetch }).balance();
    } catch (e) {
      const client = new RunwareClient({ getKey: this.getKey });
      note = `Balance not available: ${client.redact(e instanceof Error ? e.message : "request failed")}`.slice(0, 200);
    }
    if (turn !== this.asked || !this.connected) return null;
    this.balanceUsd = value;
    this.balanceNote = note;
    this.render();
    this.dispatchEvent(new CustomEvent("arena-balance-change", { bubbles: true, composed: true, detail: { balance: value } }));
    return value;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  /** True when a key is held. */
  get connected(): boolean {
    return Boolean(this.store.get());
  }

  /** The key, for RunwareClient only. Never log or store what this returns. */
  getKey = (): string | undefined => this.store.get();

  disconnect() {
    this.store.clear();
    this.remembered = false;
    this.changed();
  }

  /** Connects a key typed or pasted elsewhere; returns the problem, or null. */
  connect(key: string, remember = false): string | null {
    const k = key.trim();
    const problem = keyProblem(k);
    if (problem) return problem;
    this.store.set(k, remember ? "session" : "memory");
    this.remembered = remember;
    this.changed();
    return null;
  }

  private changed() {
    this.asked++;
    this.balanceUsd = null;
    this.balanceNote = "";
    this.render();
    this.dispatchEvent(new CustomEvent("arena-key-change", { bubbles: true, composed: true, detail: { connected: this.connected, remembered: this.remembered } }));
    if (this.connected) void this.refreshBalance();
  }

  private signup(): HTMLAnchorElement {
    let href = SIGNUP;
    try {
      const u = new URL(this.getAttribute("signup-url") ?? SIGNUP);
      if (u.protocol === "https:") href = u.href;
    } catch {
      /* keep the default */
    }
    return el("a", { href, target: "_blank", rel: "noopener noreferrer" }, "Get a key");
  }

  private render() {
    const where = el("p", { class: "note" }, "Your key stays in your browser and is sent only to api.runware.ai.");
    if (this.connected) {
      const off = el("button", { type: "button", "data-action": "disconnect" }, "Disconnect");
      off.addEventListener("click", () => this.disconnect());
      this.root.replaceChildren(
        el("style", {}, css),
        el(
          "div",
          { class: "panel", part: "panel", "data-state": "connected" },
          el("div", { class: "row" }, el("span", { class: "state" }, "Key connected"), el("span", { class: "note" }, this.remembered ? "remembered for this tab" : "held in memory until you leave"), off),
          el("div", { class: "row" }, el("span", { class: "balance", "data-field": "balance" }, this.balanceUsd === null ? "" : `Balance ${this.balanceUsd.toFixed(2)} USD`), el("span", { class: "note", "data-field": "balance-note" }, this.balanceNote)),
          where,
        ),
      );
      return;
    }
    const input = el("input", {
      type: "password",
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      maxlength: "512",
      "aria-describedby": "where",
      "data-field": "key",
    });
    const remember = el("input", { type: "checkbox", "data-field": "remember" });
    const err = el("p", { class: "err", role: "alert" });
    const go = el("button", { type: "submit", class: "primary", "data-action": "connect" }, "Connect");
    const form = el(
      "form",
      { class: "panel", part: "panel", "data-state": "disconnected" },
      el("div", { class: "row" }, el("label", { class: "field" }, el("span", { class: "lbl" }, "Runware API key"), input), go),
      el("div", { class: "row" }, el("label", { class: "note" }, remember, " Remember for this tab"), this.signup()),
      err,
      where,
    );
    where.id = "where";
    input.addEventListener("input", () => (err.textContent = ""));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const problem = this.connect(input.value, remember.checked);
      if (problem) err.textContent = problem;
      else input.value = "";
    });
    this.root.replaceChildren(el("style", {}, css), form);
  }
}

export function defineKey(name = "arena-key") {
  if (!customElements.get(name)) customElements.define(name, ArenaKey);
}
