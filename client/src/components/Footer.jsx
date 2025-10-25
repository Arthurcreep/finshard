import { useTranslation } from "react-i18next";
import s from "../styles/Footer.module.css";

// Соцсети
const SOCIALS = [
  { label: "X (Twitter)", slug: "x", href: "https://x.com/home" },
  { label: "Telegram", slug: "telegram", href: "https://t.me/Finshard" },
  { label: "ВКонтакте", slug: "vk", href: "https://vk.com/id1053846330" },
  { label: "GitHub", slug: "github", href: "https://github.com/Arthurcreep" },
];

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const COLUMNS = [
    {
      heading: t("footer.company"), // "Компания"
      links: [
        { label: t("footer.about"), href: "#" },
        { label: t("footer.blog"), href: "#" },
        { label: t("footer.jobs"), href: "#" },
      ],
    },
    {
      heading: t("footer.connect"), // "Мы в сетях"
      links: SOCIALS.map((s) => ({ label: s.label, href: s.href })),
    },
  ];

  return (
    <footer className={s.footer} role="contentinfo">
      {/* Верхняя полоса — соцсети */}
      <div className={s.joinWrap}>
        <h3 className={s.joinTitle}>{t("footer.keep")}</h3>
        <ul className={s.joinList}>
          {SOCIALS.map((x) => (
            <li key={x.label} className={s.joinItem}>
              <a
                href={x.href}
                className={s.joinBtn}
                aria-label={x.label}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className={s.joinImg}
                  src={`https://cdn.simpleicons.org/${encodeURIComponent(
                    x.slug
                  )}/fff`}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.nextSibling;
                    if (fallback) {
                      fallback.style.display = "grid";
                    }
                  }}
                />
                <span className={s.joinFallback} aria-hidden>
                  {x.label[0]}
                </span>
              </a>
              <span className={s.joinLabel}>{x.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={s.divider} aria-hidden />

      {/* Средняя зона — колонки + подписка */}
      <div className={s.container}>
        {COLUMNS.map((c) => (
          <nav key={c.heading} className={s.col} aria-label={c.heading}>
            <h4 className={s.title}>{c.heading}</h4>
            <ul className={s.links}>
              {c.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={s.link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <section className={`${s.col} ${s.subscribe}`} aria-labelledby="ft-sub">
          <h4 id="ft-sub" className={s.title}>
            {t("footer.keep")}
          </h4>
          <p className={s.lead}>{t("footer.lead")}</p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className={s.form}
            aria-label="Subscribe"
          >
            <label className="sr-only" htmlFor="ft-email">
              {t("footer.email")}
            </label>
            <input
              id="ft-email"
              type="email"
              inputMode="email"
              placeholder={t("footer.email")}
              className={s.input}
            />
            <button className={s.button} type="submit">
              {t("footer.sub")}
            </button>
          </form>

          <div className={s.smallIcons}>
            {["x","telegram", "github","vk"].map((n) => (
              <a key={n} href="#" className={s.smallIcon} aria-label={n}>
                <img
                  src={`https://cdn.simpleicons.org/${encodeURIComponent(n)}/94a3b8`}
                  alt=""
                  width="20"
                  height="20"
                />
              </a>
            ))}
          </div>
        </section>
      </div>

      {/* Нижняя законцовка */}
      <div className={s.legal}>
        <span>
          © {year}{" "}
          <a href={t("footer.companyUrl")} className={s.brand}>
            {t("footer.companyName")}
          </a>
        </span>
      </div>
    </footer>
  );
}
