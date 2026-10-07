/**
 * LKS Gateway - Portal lks.nntu.ru Integration
 * Separated auth & synchronization layer for student schedule.
 * Created by kosterik
 */

class LksGateway {
  constructor(scheduleManager) {
    this.scheduleManager = scheduleManager;
    this.isAuthenticated = false;
    this.studentInfo = null;
    
    this.init();
  }

  init() {
    const saved = localStorage.getItem("nntu_lks_session");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        // Auto-logout after 7 days maximum
        if (data.loginTimestamp && (now - data.loginTimestamp > ONE_WEEK_MS)) {
          this.logout();
          return;
        }
        this.isAuthenticated = data.isAuthenticated || false;
        this.studentInfo = data.studentInfo || null;
      } catch (e) {
        console.error(e);
      }
    }
    this.updateUI();
  }

  updateUI() {
    const disconnectedBanner = document.getElementById("lks-disconnected-banner");
    const connectedBanner = document.getElementById("lks-connected-banner");
    const studentNameEl = document.getElementById("lks-student-name");
    const studentGroupEl = document.getElementById("lks-student-group");
    const lastSyncEl = document.getElementById("lks-last-sync");

    if (this.isAuthenticated && this.studentInfo) {
      if (disconnectedBanner) disconnectedBanner.style.display = "none";
      if (connectedBanner) connectedBanner.style.display = "flex";
      if (studentNameEl) studentNameEl.textContent = this.studentInfo.studentName || "Студент";
      if (studentGroupEl) studentGroupEl.textContent = `Группа: ${this.studentInfo.group || "Не указана"}`;
      if (lastSyncEl) lastSyncEl.textContent = `Синхронизировано: ${this.studentInfo.lastSync || "Недавно"}`;
    } else {
      if (disconnectedBanner) disconnectedBanner.style.display = "flex";
      if (connectedBanner) connectedBanner.style.display = "none";
    }
  }

  async login(username, password) {
    const errEl = document.getElementById("lks-login-error");
    if (errEl) errEl.style.display = "none";

    try {
      const resp = await fetch("/api/lks/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: username, password: password })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        const errorMsg = data.error || "Неверный логин/пароль или сервер lks.nntu.ru недоступен";
        if (errEl) {
          errEl.textContent = errorMsg;
          errEl.style.display = "block";
        }
        return { success: false, error: errorMsg };
      }

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString();

      this.studentInfo = {
        login: username,
        studentName: data.studentName || username,
        group: data.group || "Студент",
        lastSync: now
      };
      this.isAuthenticated = true;

      localStorage.setItem("nntu_lks_session", JSON.stringify({
        isAuthenticated: true,
        studentInfo: this.studentInfo,
        loginTimestamp: Date.now()
      }));

      if (data.schedule) {
        this.scheduleManager.updateScheduleData(data.schedule);
      }

      this.updateUI();
      return { success: true };
    } catch (e) {
      const errorMsg = "Ошибка подключения к серверу: " + e.message;
      if (errEl) {
        errEl.textContent = errorMsg;
        errEl.style.display = "block";
      }
      return { success: false, error: errorMsg };
    }
  }

  logout() {
    this.isAuthenticated = false;
    this.studentInfo = null;
    localStorage.removeItem("nntu_lks_session");
    this.updateUI();
  }

  async syncNow() {
    if (!this.isAuthenticated) return false;
    const curGroup = localStorage.getItem("nntu_current_group") || (this.scheduleManager?.scheduleData?.group);
    if (curGroup) {
      await this.scheduleManager.fetchGroupSchedule(curGroup);
      this.scheduleManager.render();
    }
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString();
    if (this.studentInfo) {
      this.studentInfo.lastSync = now;
      if (curGroup) this.studentInfo.group = curGroup;
    }
    localStorage.setItem("nntu_lks_session", JSON.stringify({
      isAuthenticated: true,
      studentInfo: this.studentInfo
    }));
    this.updateUI();
    return true;
  }
}

window.LksGateway = LksGateway;
