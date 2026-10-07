/**
 * Notification Service
 * Manages scheduled timetable alarms and class notifications.
 * Created by kosterik
 */

class NotificationService {
  constructor(scheduleManager) {
    this.scheduleManager = scheduleManager;
    this.enabled = localStorage.getItem("nntu_notif_enabled") === "true";
    this.time = localStorage.getItem("nntu_notif_time") || "07:30";
    this.beforePair = localStorage.getItem("nntu_notif_before") !== "false";
    this.lastNotifiedDay = localStorage.getItem("nntu_notif_last_day") || "";
    
    this.init();
  }

  init() {
    this.bindEvents();
    if (this.enabled) {
      this.requestPermission();
    }
    this.startScheduler();
  }

  async requestPermission() {
    if ("Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        try {
          await Notification.requestPermission();
        } catch (e) {}
      }
    }
  }

  bindEvents() {
    const toggle = document.getElementById("notif-toggle-input");
    const timeInput = document.getElementById("notif-time-input");
    const beforeToggle = document.getElementById("notif-before-pair-input");
    const testBtn = document.getElementById("btn-test-notification");

    if (toggle) {
      toggle.checked = this.enabled;
      toggle.addEventListener("change", (e) => {
        this.enabled = e.target.checked;
        localStorage.setItem("nntu_notif_enabled", this.enabled);
        if (this.enabled) {
          this.requestPermission();
          this.showToast("🔔 Уведомления включены");
        } else {
          this.showToast("🔕 Уведомления отключены");
        }
      });
    }

    if (timeInput) {
      timeInput.value = this.time;
      timeInput.addEventListener("change", (e) => {
        this.time = e.target.value;
        localStorage.setItem("nntu_notif_time", this.time);
        this.showToast(`⏰ Время напоминания сохранено: ${this.time}`);
      });
    }

    if (beforeToggle) {
      beforeToggle.checked = this.beforePair;
      beforeToggle.addEventListener("change", (e) => {
        this.beforePair = e.target.checked;
        localStorage.setItem("nntu_notif_before", this.beforePair);
      });
    }

    testBtn?.addEventListener("click", () => {
      this.requestPermission();
      this.sendNotification("НГТУ Расписание", "Тестовое уведомление: пара через 15 минут в ауд. 6254 (к.6)");
    });

    // Android Alarm Clock
    const alarmRow = document.getElementById("row-system-alarm");
    const alarmBtn = document.getElementById("btn-set-alarm");
    const alarmOffset = document.getElementById("notif-alarm-offset");
    if (window.AndroidWidget && alarmRow && alarmBtn) {
      alarmRow.style.display = "flex";
      alarmBtn.addEventListener("click", () => {
        const offset = parseInt(alarmOffset.value) || 80;
        this.setSystemAlarm(offset);
      });
    }
  }

  setSystemAlarm(offsetMinutes) {
    if (!this.scheduleManager) return;
    const now = new Date();
    let targetIndex = now.getDay() === 0 ? 1 : now.getDay();
    let lessons = this.scheduleManager.getLessonsForDay(targetIndex);
    
    const isDayOver = () => {
      if (lessons.length === 0) return true;
      const last = lessons[lessons.length - 1];
      if (!last.time) return true;
      const endStr = last.time.split("-")[1];
      if (!endStr) return true;
      const [eH, eM] = endStr.trim().split(":").map(Number);
      return (now.getHours() * 60 + now.getMinutes()) > (eH * 60 + eM);
    };

    if (lessons.length === 0 || isDayOver()) {
      targetIndex = targetIndex + 1;
      if (targetIndex > 6) targetIndex = 1;
      lessons = this.scheduleManager.getLessonsForDay(targetIndex);
    }

    if (lessons.length === 0) {
      this.showToast("В ближайшие дни пар нет!");
      return;
    }

    const first = lessons[0];
    if (!first.time) return;

    const [startStr] = first.time.split("-");
    const [pH, pM] = startStr.trim().split(":").map(Number);
    
    let alarmTotalMin = pH * 60 + pM - offsetMinutes;
    if (alarmTotalMin < 0) alarmTotalMin += 24 * 60;

    const aH = Math.floor(alarmTotalMin / 60);
    const aM = alarmTotalMin % 60;
    const message = `НГТУ: ${first.subject} (${first.room})`;

    if (window.AndroidWidget && typeof window.AndroidWidget.setAlarmClock === "function") {
      try {
        window.AndroidWidget.setAlarmClock(aH, aM, message);
        this.showToast(`Будильник передан в систему: ${String(aH).padStart(2,'0')}:${String(aM).padStart(2,'0')}`);
      } catch (err) {
        this.showToast("Ошибка при установке будильника");
      }
    }
  }

  async sendNotification(title, body) {
    // 1. Send native Windows toast via Python backend
    try {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title, message: body })
      }).catch(() => {});
    } catch (e) {}

    // 2. Browser / WebView Web Notification
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body: body,
          icon: "../app_assets/icon.png"
        });
      } catch (err) {}
    }

    // 2.5. Android Native Notification (via JavascriptInterface)
    if (window.AndroidWidget && typeof window.AndroidWidget.showNotification === "function") {
      try {
        window.AndroidWidget.showNotification(title, body);
      } catch (err) {}
    }

    // 3. In-app toast popup
    this.showToast(`🔔 ${title}: ${body}`);
  }

  showToast(message) {
    let toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--color-canvas-subtle);
        border: 1px solid var(--color-accent-fg);
        color: var(--color-fg-default);
        padding: 12px 20px;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        font-size: 13px;
        font-weight: 600;
        z-index: 1000;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => {
      if (toast) toast.style.opacity = "0";
    }, 4000);
  }

  startScheduler() {
    // Check every 10 seconds without missing minute windows
    setInterval(() => {
      if (!this.enabled) return;

      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const currentM = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentH}:${currentM}`;
      const todayDateStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
      const nowTotalMin = now.getHours() * 60 + now.getMinutes();

      // 1. Daily morning timetable summary check
      if (currentTimeStr === this.time && this.lastNotifiedDay !== todayDateStr) {
        this.lastNotifiedDay = todayDateStr;
        localStorage.setItem("nntu_notif_last_day", todayDateStr);

        const todayLessons = this.scheduleManager ? this.scheduleManager.getLessonsForDay(now.getDay()) : [];
        if (todayLessons.length > 0) {
          const first = todayLessons[0];
          const startTime = first.time ? first.time.split(" - ")[0] : "утра";
          this.sendNotification(
            "Расписание НГТУ на сегодня",
            `Всего пар: ${todayLessons.length}. Первая пара в ${startTime}: ${first.subject} (ауд. ${first.room})`
          );
        } else {
          this.sendNotification("Расписание НГТУ", "Сегодня занятий нет — выходной день!");
        }
      }

      // 2. 15-minute before pair reminder
      if (this.beforePair && this.scheduleManager) {
        const todayLessons = this.scheduleManager.getLessonsForDay(now.getDay());
        for (const lesson of todayLessons) {
          if (!lesson.time) continue;
          const [startStr] = lesson.time.split(" - ");
          const [pH, pM] = startStr.trim().split(":").map(Number);
          if (isNaN(pH) || isNaN(pM)) continue;

          const pairTotalMin = pH * 60 + pM;
          const diffMin = pairTotalMin - nowTotalMin;

          // If between 10 and 15 minutes before class
          if (diffMin >= 10 && diffMin <= 15) {
            const reminderKey = `nntu_reminded_${todayDateStr}_pair_${lesson.pair}`;
            if (!localStorage.getItem(reminderKey)) {
              localStorage.setItem(reminderKey, "true");
              this.sendNotification(
                `Скоро пара №${lesson.pair} (${startStr.trim()})`,
                `${lesson.subject} (${lesson.type || "Занятие"}) в ауд. ${lesson.room} (корп. ${lesson.building || "НГТУ"})`
              );
            }
          }
        }
      }
    }, 10000);
  }
}

window.NotificationService = NotificationService;
