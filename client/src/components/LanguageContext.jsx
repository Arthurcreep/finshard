// LanguageContext.jsx
import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import i18n from "./i18n";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem("lang") || i18n.language || "ru");

    // Меняем язык i18next + сохраняем
    useEffect(() => {
        if (lang && i18n.language !== lang) i18n.changeLanguage(lang);
        localStorage.setItem("lang", lang);
    }, [lang]);

    const value = useMemo(() => ({ lang, setLang }), [lang]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useLanguage должен вызываться внутри <LanguageProvider>.");
    return ctx;
}
