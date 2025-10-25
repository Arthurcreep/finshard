import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "../styles/InvestmentCards.module.css";

export default function InvestmentModal({ open, onClose, title, children }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const first = dialogRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus?.();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      data-open
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        ref={dialogRef}
        data-open
      >
        <header className={styles.modalHead}>
          {title ? <h3 className={styles.title}>{title}</h3> : null}
          <button className={styles.close} aria-label={t("common.close")} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalGrid}>{children}</div>
      </div>
    </div>
  );
}
