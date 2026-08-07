(() => {
  "use strict";

  const config = window.MANATSUKUTO_CONFIG || {};
  const email = config.contactEmail || "nishioka.ai.solutions@gmail.com";
  const bookingUrl = config.bookingUrl || "https://calendar.app.google/Xd9vDivzvxCx7pxJ6";

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  document.querySelectorAll("[data-email-link]").forEach((link) => {
    link.href = `mailto:${email}`;
    link.textContent = email;
  });

  document.querySelectorAll("[data-booking-link]").forEach((link) => {
    link.href = bookingUrl;
  });

  const header = document.querySelector("[data-header]");
  const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 12);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (navToggle && nav) {
    const closeNav = () => {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    };
    navToggle.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") !== "true";
      navToggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    });
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNav));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeNav();
        navToggle.focus();
      }
    });
  }

  const revealNodes = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -24px" });
    revealNodes.forEach((node) => observer.observe(node));
  }

  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const message = form.querySelector("#message");
  const count = form.querySelector("[data-count]");
  const status = form.querySelector("[data-form-status]");
  const submitButton = form.querySelector("[data-submit-button]");

  const updateCount = () => {
    if (count && message) count.textContent = String(message.value.length);
  };
  updateCount();
  message?.addEventListener("input", updateCount);

  const setStatus = (text, type = "") => {
    if (!status) return;
    status.textContent = text;
    status.className = `form-status${type ? ` is-${type}` : ""}`;
  };

  const valueOf = (data, key) => String(data.get(key) || "").trim();
  const buildMailBody = (data) => [
    "MANATSUKUTO Webサイトからのご相談",
    "",
    `お名前・担当者名: ${valueOf(data, "name")}`,
    `返信先メール: ${valueOf(data, "email")}`,
    `ご相談者: ${valueOf(data, "customerType")}`,
    `相談の種類: ${valueOf(data, "consultType")}`,
    `希望日時（任意）: ${valueOf(data, "preferredDate") || "未入力"}`,
    `希望する相談方法（任意）: ${valueOf(data, "method") || "未入力"}`,
    "",
    "相談内容:",
    valueOf(data, "message")
  ].join("\n");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus("入力内容をご確認ください。未入力または形式の異なる項目があります。", "error");
      return;
    }

    const data = new FormData(form);
    const endpoint = String(config.formEndpoint || "").trim();
    const useProvider = config.formMode === "provider" && endpoint;

    if (!useProvider) {
      const subject = encodeURIComponent(`無料相談・お問い合わせ（${valueOf(data, "name")}様）`);
      const body = encodeURIComponent(buildMailBody(data));
      setStatus("メールアプリを開きます。内容を確認し、メールアプリの送信ボタンを押してください。", "success");
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    setStatus("送信しています…");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      updateCount();
      setStatus("お問い合わせを受け付けました。内容を確認後、代表メールからご連絡します。", "success");
    } catch (error) {
      console.error("Contact form submission failed", error);
      setStatus(`送信できませんでした。入力内容はそのままです。もう一度お試しいただくか、${email} へ直接ご連絡ください。`, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  });
})();
