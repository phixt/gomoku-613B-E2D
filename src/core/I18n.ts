import zhCN from "../locales/zh-CN";
import enUS from "../locales/en-US";

// Derive key union from zh-CN (authoritative key set)
type LocaleKey = keyof typeof zhCN;
type Locale = Record<LocaleKey, string>;

const LOCALES: Record<string, Locale> = {
  "zh-CN": zhCN as Locale,
  "en-US": enUS as Locale,
};

const STORAGE_KEY = "app_lang";

class I18n {
  private current: Locale;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.current = LOCALES[saved ?? ""] ?? (zhCN as Locale);
  }

  setLang(lang: string): void {
    const locale = LOCALES[lang];
    if (locale) {
      this.current = locale;
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }

  get lang(): string {
    for (const [key, val] of Object.entries(LOCALES)) {
      if (val === this.current) return key;
    }
    return "zh-CN";
  }

  getLang(): string {
    return this.lang;
  }

  t(key: LocaleKey, ...args: (string | number)[]): string {
    const template = this.current[key];
    if (typeof template !== "string") return String(key);
    let result = template;
    for (let i = 0; i < args.length; i++) {
      result = result.replace(`{${i}}`, String(args[i]));
    }
    return result;
  }
}

export const i18n = new I18n();
