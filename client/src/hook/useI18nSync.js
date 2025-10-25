// useI18nSync.js
import { useEffect, useRef } from 'react';
import i18n from '../i18n/i18n';

const RTL = new Set(['ar']);

export function useI18nSync(lang, setLang) {
  const langRef = useRef(lang);

  // 1) Когда меняется lang из контекста — синхронизируем i18n + html атрибуты
  useEffect(() => {
    if (!lang) return;
    langRef.current = lang;

    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }

    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', RTL.has(lang) ? 'rtl' : 'ltr');
  }, [lang]);

  // 2) Когда язык меняет сам i18n (например, через детектор/свитчер) —
  // приводим в порядок html и при необходимости обновляем контекст
  useEffect(() => {
    const onChange = (lng) => {
      document.documentElement.setAttribute('lang', lng);
      document.documentElement.setAttribute('dir', RTL.has(lng) ? 'rtl' : 'ltr');

      // Если у тебя есть setLang в ThemeLangContext — можно синхронизировать обратно:
      if (setLang && langRef.current !== lng) {
        langRef.current = lng;
        setLang(lng);
      }
    };
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, [setLang]);
}
