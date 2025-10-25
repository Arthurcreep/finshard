// i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ru from './locales/ru.json';
import en from './locales/en.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import ko from './locales/ko.json';
import ja from './locales/ja.json';

i18n
  .use(LanguageDetector) // 👈 добавили
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      ja: { translation: ja },
      ko: { translation: ko },
      zh: { translation: zh },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'htmlTag', 'navigator'], // порядок определения
      caches: ['localStorage'], // запоминаем выбор
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
