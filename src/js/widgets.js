/**
 * Widgets Engine
 * Renders home screen / desktop widget previews & provides data exports.
 * Created by kosterik
 */

class WidgetsEngine {
  constructor(scheduleManager) {
    this.scheduleManager = scheduleManager;
    this.init();
  }

  init() {
    this.renderTomorrowWidget();
    this.renderTodayTomorrowWidget();
    this.updateAndroidWidgets();
  }

  updateAndroidWidgets() {
    if (!window.AndroidWidget) return;
    
    const groupName = this.scheduleManager.scheduleData?.group || "Не выбрана";
    
    const todayIndex = new Date().getDay() === 0 ? 1 : new Date().getDay();
    let tomorrowIndex = todayIndex + 1;
    if (tomorrowIndex > 6) tomorrowIndex = 1;
    
    const todayLessons = this.scheduleManager.getLessonsForDay(todayIndex);
    const tomorrowLessons = this.scheduleManager.getLessonsForDay(tomorrowIndex);
    
    const formatLessons = (lessons) => {
      if (lessons.length === 0) return "Пар нет";
      return lessons.map((l, idx) => `${idx + 1}. ${l.subject} (${l.room})`).join("\n");
    };
    
    const todayStr = formatLessons(todayLessons);
    const tomorrowStr = formatLessons(tomorrowLessons);
    
    try {
      window.AndroidWidget.updateWidgetData(groupName, todayStr, tomorrowStr);
    } catch (e) {
      console.error("Failed to update Android widgets:", e);
    }
  }

  renderTomorrowWidget() {
    const container = document.getElementById("widget-tomorrow-content");
    if (!container) return;

    const todayIndex = new Date().getDay(); // 0-6
    let tomorrowIndex = todayIndex + 1;
    if (tomorrowIndex > 6) tomorrowIndex = 1; // skip Sunday to Monday

    const daysNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    const tomorrowLessons = this.scheduleManager.getLessonsForDay(tomorrowIndex);

    document.getElementById("widget-tomorrow-day-title").textContent = `Завтра (${daysNames[tomorrowIndex]})`;

    if (tomorrowLessons.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--color-fg-muted); font-size: 13px;">
          😴 Завтра пар нет! Отдыхайте.
        </div>
      `;
      return;
    }

    container.innerHTML = tomorrowLessons.map(l => `
      <div class="widget-content-item">
        <div>
          <div class="widget-subj">${l.subject}</div>
          <div class="widget-time">${l.time} • ${l.type}</div>
        </div>
        <div class="widget-room">к.${l.building} ${l.room}</div>
      </div>
    `).join("");
  }

  renderTodayTomorrowWidget() {
    const todayContainer = document.getElementById("widget-dual-today-content");
    const tomorrowContainer = document.getElementById("widget-dual-tomorrow-content");
    if (!todayContainer || !tomorrowContainer) return;

    const todayIndex = new Date().getDay() === 0 ? 1 : new Date().getDay();
    let tomorrowIndex = todayIndex + 1;
    if (tomorrowIndex > 6) tomorrowIndex = 1;

    const groupPill = document.getElementById("widget-dual-group-pill");
    if (groupPill) {
      groupPill.textContent = this.scheduleManager.scheduleData?.group || "26-ИВТ-4-1";
    }

    const todayLessons = this.scheduleManager.getLessonsForDay(todayIndex);
    const tomorrowLessons = this.scheduleManager.getLessonsForDay(tomorrowIndex);

    // Today
    if (todayLessons.length === 0) {
      todayContainer.innerHTML = `<div style="color:var(--color-fg-muted); font-size:12px; padding:8px;">Сегодня пар нет</div>`;
    } else {
      todayContainer.innerHTML = todayLessons.map(l => `
        <div class="widget-content-item" style="padding: 6px 10px; margin-bottom: 4px;">
          <div>
            <div style="font-size:12px; font-weight:600;">${l.subject}</div>
            <div class="widget-time">${l.time}</div>
          </div>
          <div class="widget-room" style="font-size:10px;">${l.room}</div>
        </div>
      `).join("");
    }

    // Tomorrow
    if (tomorrowLessons.length === 0) {
      tomorrowContainer.innerHTML = `<div style="color:var(--color-fg-muted); font-size:12px; padding:8px;">Завтра пар нет</div>`;
    } else {
      tomorrowContainer.innerHTML = tomorrowLessons.map(l => `
        <div class="widget-content-item" style="padding: 6px 10px; margin-bottom: 4px;">
          <div>
            <div style="font-size:12px; font-weight:600;">${l.subject}</div>
            <div class="widget-time">${l.time}</div>
          </div>
          <div class="widget-room" style="font-size:10px;">${l.room}</div>
        </div>
      `).join("");
    }
  }
}

window.WidgetsEngine = WidgetsEngine;
