/**
 * News Feed Loader
 * Displays latest news from https://www.nntu.ru/news/all/vse-novosti
 * Created by kosterik
 */

window.openExternalUrl = function(url) {
  if (!url) return;
  // Try desktop backend API first to open in external OS browser (Chrome/Edge/Firefox)
  fetch("/api/open-external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url })
  }).then(resp => {
    if (!resp.ok) {
      window.open(url, "_blank");
    }
  }).catch(() => {
    window.open(url, "_blank");
  });
};

class NewsLoader {
  constructor() {
    this.container = document.getElementById("nntu-news-container");
    this.init();
  }

  async init() {
    if (!this.container) return;
    try {
      let news = null;
      try {
        const resp = await fetch("/api/news");
        if (resp.ok) news = await resp.json();
      } catch (e) {}

      if (!news || !news.length) {
        let resp2 = await fetch("/app_assets/news.json").catch(() => null);
        if (!resp2 || !resp2.ok) {
          resp2 = await fetch("../app_assets/news.json").catch(() => null);
        }
        if (resp2 && resp2.ok) {
          news = await resp2.json();
        }
      }

      if (Array.isArray(news)) {
        news = news.slice(0, 9);
      }

      this.render(news);
    } catch (e) {
      console.warn("Could not load news", e);
    }
  }

  render(newsList) {
    if (!this.container || !Array.isArray(newsList)) return;

    this.container.innerHTML = newsList.map(item => `
      <div class="news-card" data-url="${item.url}" style="cursor: pointer;">
        <div>
          <div class="news-card-header">
            <span class="news-tag">${item.category || "Новости"}</span>
            <span class="news-date">${item.date || ""}</span>
          </div>
          <div class="news-title">${item.title}</div>
        </div>
        <div class="news-card-footer">
          <span>Читать на nntu.ru</span>
          <span>→</span>
        </div>
      </div>
    `).join("");

    this.container.querySelectorAll(".news-card").forEach(card => {
      card.addEventListener("click", () => {
        const url = card.getAttribute("data-url");
        if (url) window.openExternalUrl(url);
      });
    });
  }
}

window.NewsLoader = NewsLoader;
