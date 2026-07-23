const siteConfig = Object.freeze({
  lineUrl: "https://lin.ee/OuQwwsB",
  gaMeasurementId: "",
  themeStorageKey: "fluxtech-theme",
  ...(typeof fluxtechSiteConfig === "undefined" ? {} : fluxtechSiteConfig),
});

const root = document.documentElement;
const themeToggles = document.querySelectorAll("[data-theme-toggle]");
const themeOptions = document.querySelectorAll("[data-theme-option]");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setTheme(theme, { persist = false } = {}) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  root.dataset.theme = nextTheme;

  // 讓 WebGL flow field 不耦合主題切換程式也能同步更新顏色與混色模式。
  window.dispatchEvent(new CustomEvent("fluxtech:themechange", { detail: { theme: nextTheme } }));

  if (persist) {
    try {
      localStorage.setItem(siteConfig.themeStorageKey, nextTheme);
    } catch {
      // Theme still works when storage is unavailable.
    }
  }

  const targetTheme = nextTheme === "dark" ? "light" : "dark";
  const targetLabel = targetTheme === "dark" ? "深色" : "淺色";
  const targetIcon = targetTheme === "dark" ? "dark_mode" : "light_mode";
  const actionLabel = `切換為${targetLabel}模式`;

  themeToggles.forEach((toggle) => {
    toggle.setAttribute("aria-label", actionLabel);
    toggle.setAttribute("title", actionLabel);

    const label = toggle.querySelector("[data-theme-toggle-label]");
    const icon = toggle.querySelector("[data-theme-toggle-icon]");
    if (label) label.textContent = targetLabel;
    if (icon) icon.textContent = targetIcon;
  });

  themeOptions.forEach((option) => {
    option.setAttribute("aria-pressed", String(option.dataset.themeOption === nextTheme));
  });

  if (themeColorMeta) {
    themeColorMeta.content = nextTheme === "dark" ? "#0b0e0c" : "#f5f7f1";
  }
}

function hasSavedTheme() {
  try {
    return Boolean(localStorage.getItem(siteConfig.themeStorageKey));
  } catch {
    return false;
  }
}

setTheme(root.dataset.theme);

themeToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme, { persist: true });
  });
});

themeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    setTheme(option.dataset.themeOption, { persist: true });
  });
});

const syncSystemTheme = (event) => {
  if (!hasSavedTheme()) {
    setTheme(event.matches ? "dark" : "light");
  }
};

if (typeof systemTheme.addEventListener === "function") {
  systemTheme.addEventListener("change", syncSystemTheme);
} else {
  systemTheme.addListener?.(syncSystemTheme);
}

const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const siteHeader = document.querySelector("[data-site-header]");

function setMenu(open) {
  if (!menuToggle || !mobileNav || !siteHeader) return;

  const menuIcon = menuToggle.querySelector("[data-menu-toggle-icon]");
  const menuLabel = menuToggle.querySelector("[data-menu-toggle-label]");

  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "關閉導覽選單" : "開啟導覽選單");
  if (menuIcon) menuIcon.textContent = open ? "close" : "menu";
  if (menuLabel) menuLabel.textContent = open ? "關閉" : "選單";
  mobileNav.dataset.open = String(open);
  siteHeader.classList.toggle("is-menu-open", open);
  syncMobileStickyCta();
}

menuToggle?.addEventListener("click", () => {
  setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

window.addEventListener("resize", () => {
  if (window.innerWidth >= 992) setMenu(false);
});

function syncHeader() {
  siteHeader?.classList.toggle("is-scrolled", window.scrollY > 18);
}

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

const mobileStickyCta = document.querySelector("[data-mobile-sticky]");
const heroSection = document.querySelector(".hero");
const mobileCtaEndSections = [document.querySelector(".contact-cta"), document.querySelector(".site-footer")].filter(Boolean);
const mobileCtaViewport = window.matchMedia("(max-width: 39.999rem)");
const mobileCtaEndSectionsInView = new Set();

function isInViewport(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

let heroInView = isInViewport(heroSection);
mobileCtaEndSections.forEach((section) => {
  if (isInViewport(section)) mobileCtaEndSectionsInView.add(section);
});

function syncMobileStickyCta() {
  if (!mobileStickyCta) return;

  const menuOpen = menuToggle?.getAttribute("aria-expanded") === "true";
  const visible =
    mobileCtaViewport.matches &&
    !heroInView &&
    mobileCtaEndSectionsInView.size === 0 &&
    !menuOpen;

  mobileStickyCta.dataset.visible = String(visible);
  mobileStickyCta.setAttribute("aria-hidden", String(!visible));
  mobileStickyCta.tabIndex = visible ? 0 : -1;
}

syncMobileStickyCta();

if ("IntersectionObserver" in window) {
  if (heroSection) {
    const mobileCtaHeroObserver = new IntersectionObserver(([entry]) => {
      heroInView = entry.isIntersecting;
      syncMobileStickyCta();
    });
    mobileCtaHeroObserver.observe(heroSection);
  }

  const mobileCtaEndObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        mobileCtaEndSectionsInView.add(entry.target);
      } else {
        mobileCtaEndSectionsInView.delete(entry.target);
      }
    });
    syncMobileStickyCta();
  });

  mobileCtaEndSections.forEach((section) => mobileCtaEndObserver.observe(section));
} else {
  const syncMobileStickyCtaFromLayout = () => {
    heroInView = isInViewport(heroSection);
    mobileCtaEndSectionsInView.clear();
    mobileCtaEndSections.forEach((section) => {
      if (isInViewport(section)) mobileCtaEndSectionsInView.add(section);
    });
    syncMobileStickyCta();
  };

  window.addEventListener("scroll", syncMobileStickyCtaFromLayout, { passive: true });
  window.addEventListener("resize", syncMobileStickyCtaFromLayout);
}

if (typeof mobileCtaViewport.addEventListener === "function") {
  mobileCtaViewport.addEventListener("change", syncMobileStickyCta);
} else {
  mobileCtaViewport.addListener?.(syncMobileStickyCta);
}

const revealElements = [...document.querySelectorAll(".reveal")];

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px 10%", threshold: 0.01 },
  );

  revealElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 1.1 && rect.bottom >= 0) {
      element.classList.add("is-visible");
    }
    revealObserver.observe(element);
  });
  root.classList.add("reveal-ready");
}

const navLinks = [...document.querySelectorAll('.desktop-nav a[href^="#"]')];
const observedSections = [...document.querySelectorAll("main section[id]")];

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const activeEntry = entries.find((entry) => entry.isIntersecting);
      if (!activeEntry) return;

      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.hash === `#${activeEntry.target.id}`);
      });
    },
    { rootMargin: "-35% 0px -55%", threshold: 0 },
  );

  observedSections.forEach((section) => sectionObserver.observe(section));
}

document.querySelectorAll(".faq-list details").forEach((detail) => {
  detail.addEventListener("toggle", () => {
    if (!detail.open) return;

    document.querySelectorAll(".faq-list details").forEach((otherDetail) => {
      if (otherDetail !== detail) otherDetail.open = false;
    });
  });
});

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

function initializeGa4(measurementId) {
  const validId = /^G-[A-Z0-9]+$/i.test(measurementId) && !measurementId.includes("XXXX");
  if (!validId) return;

  const isDebugMode = new URLSearchParams(window.location.search).has("ga_debug");

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: true,
    ...(isDebugMode ? { debug_mode: true } : {}),
  });

  const analyticsScript = document.createElement("script");
  analyticsScript.async = true;
  analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(analyticsScript);
}

function trackEvent(name, parameters = {}) {
  if (typeof window.gtag === "function") {
    window.gtag("event", name, parameters);
  }

  window.dispatchEvent(
    new CustomEvent("fluxtech:analytics", {
      detail: { name, parameters },
    }),
  );
}

initializeGa4(siteConfig.gaMeasurementId);

document.querySelectorAll("[data-line-link]").forEach((link) => {
  link.href = siteConfig.lineUrl;
  link.addEventListener("click", () => {
    trackEvent("line_consult_click", {
      placement: link.dataset.placement || "unknown",
      link_url: siteConfig.lineUrl,
    });
  });
});
