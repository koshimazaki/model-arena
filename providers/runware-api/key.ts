/**
 * The browser key store. The key lives in memory, or in sessionStorage when
 * the reader asks for it to survive a reload; it is never written to
 * localStorage, a cookie, the URL or a log, and only RunwareClient sends it,
 * only to api.runware.ai.
 */
const SESSION_KEY = "model-arena:runware-key";

export class KeyStore {
  private key: string | undefined;

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = safeSession()) {
    try {
      this.key = this.storage?.getItem(SESSION_KEY) ?? undefined;
    } catch {
      this.key = undefined;
    }
  }

  get = (): string | undefined => this.key;

  set(key: string, remember: "memory" | "session" = "memory") {
    this.key = key.trim() || undefined;
    try {
      if (remember === "session" && this.key) this.storage?.setItem(SESSION_KEY, this.key);
      else this.storage?.removeItem(SESSION_KEY);
    } catch {
      /* storage blocked: memory only */
    }
  }

  clear() {
    this.key = undefined;
    try {
      this.storage?.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

function safeSession() {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}
