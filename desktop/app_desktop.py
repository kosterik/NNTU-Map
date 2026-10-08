import os
import sys
import json
import threading
import subprocess
import shutil
from http.server import SimpleHTTPRequestHandler, HTTPServer
import urllib.parse
import webbrowser
import time

PORT = 54321

if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(sys.executable)
    if os.path.exists(os.path.join(exe_dir, "src", "index.html")):
        WORKSPACE_ROOT = exe_dir
    else:
        WORKSPACE_ROOT = getattr(sys, '_MEIPASS', exe_dir)
else:
    WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

NNTU_IP = "213.177.120.46"


WIN_SUBPROCESS_KWARGS = {}
if sys.platform == "win32":
    WIN_SUBPROCESS_KWARGS["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 0  # SW_HIDE
    WIN_SUBPROCESS_KWARGS["startupinfo"] = startupinfo


def send_windows_toast(title, message):
    """Triggers native Windows notification without blocking or shell popup"""
    ps1_path = os.path.join(WORKSPACE_ROOT, "desktop", "notify.ps1")
    if os.path.exists(ps1_path):
        try:
            subprocess.Popen([
                "powershell", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
                "-File", ps1_path, str(title), str(message)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **WIN_SUBPROCESS_KWARGS)
            return
        except Exception as e:
            pass

    safe_title = str(title).replace("'", " ").replace('"', ' ')
    safe_msg = str(message).replace("'", " ").replace('"', ' ')
    ps_cmd = (
        "[reflection.assembly]::loadwithpartialname('System.Windows.Forms') > $null; "
        "$balloon = New-Object System.Windows.Forms.NotifyIcon; "
        "$balloon.Icon = [System.Drawing.SystemIcons]::Information; "
        "$balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info; "
        f"$balloon.BalloonTipTitle = '{safe_title}'; "
        f"$balloon.BalloonTipText = '{safe_msg}'; "
        "$balloon.Visible = $True; "
        "$balloon.ShowBalloonTip(4000); "
        "Start-Sleep -Seconds 2; $balloon.Dispose()"
    )
    try:
        subprocess.Popen([
            "powershell", "-WindowStyle", "Hidden", "-Command", ps_cmd
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **WIN_SUBPROCESS_KWARGS)
    except Exception as e:
        pass


def fetch_nntu_curl(url, method="GET", data_dict=None, timeout_sec=8):
    """
    Executes fast network request to NNTU servers using curl with direct IP resolve,
    bypassing slow local Windows DNS and TLS renegotiation issues.
    """
    cmd = [
        "curl.exe", "-k", "-s",
        "--resolve", f"my-api.nntu.ru:443:{NNTU_IP}",
        "--resolve", f"auth02.nntu.ru:443:{NNTU_IP}",
        "--resolve", f"lks-api.nntu.ru:443:{NNTU_IP}",
        "--resolve", f"lks.nntu.ru:443:{NNTU_IP}",
        "--resolve", f"www.nntu.ru:443:{NNTU_IP}",
        "--max-time", str(timeout_sec),
        "-X", method
    ]
    if data_dict:
        encoded = urllib.parse.urlencode(data_dict)
        cmd.extend(["-H", "Content-Type: application/x-www-form-urlencoded", "-d", encoded])
    cmd.append(url)

    try:
        res = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore",
            timeout=timeout_sec + 2,
            **WIN_SUBPROCESS_KWARGS
        )
        return res.returncode == 0, res.stdout
    except Exception as e:
        return False, str(e)


def convert_nntu_schedule(raw_data, group_name):
    """
    Converts raw JSON from https://my-api.nntu.ru/lesson-schedule/public/group-schedule
    into the application's clean timetable format.
    """
    times = raw_data.get("times", [
        "Время занятия",
        "08:00—09:35",
        "09:45—11:20",
        "11:35—13:10",
        "13:40—15:15",
        "15:25—17:00",
        "17:10—18:45",
        "18:55—20:30"
    ])

    days_map = {
        "понедельник": "1",
        "вторник": "2",
        "среда": "3",
        "четверг": "4",
        "пятница": "5",
        "суббота": "6",
        "воскресенье": "7"
    }

    type_map = {
        "лек.": "Лекция",
        "лаб. раб.": "Лабораторная",
        "практ.": "Практика",
        "конс.": "Консультация",
        "экз.": "Экзамен",
        "зач.": "Зачет"
    }

    def parse_room_building(room_str):
        if not room_str:
            return "", "1"
        clean = room_str.strip()
        import re
        m_b = re.search(r'корп(?:ус|\.)?\s*№?\s*(\d+)', clean, re.IGNORECASE)
        b_num = m_b.group(1) if m_b else None

        m_r = re.search(r'\b(\d{3,4}[а-яА-Я]?)\b', clean)
        r_num = m_r.group(1) if m_r else clean

        if not b_num:
            if re.match(r'^[1-6]\d{3}', r_num):
                b_num = r_num[0]
            else:
                b_num = "1"
        return r_num, b_num

    def process_week(week_days, label):
        days_dict = {
            "1": {"name": "Понедельник", "date": "", "lessons": []},
            "2": {"name": "Вторник", "date": "", "lessons": []},
            "3": {"name": "Среда", "date": "", "lessons": []},
            "4": {"name": "Четверг", "date": "", "lessons": []},
            "5": {"name": "Пятница", "date": "", "lessons": []},
            "6": {"name": "Суббота", "date": "", "lessons": []}
        }
        for item in week_days:
            raw_title = item.get("dayOfTheWeek", "").strip()
            day_title = raw_title.lower()
            day_key = None
            for ru_day, k in days_map.items():
                if ru_day in day_title:
                    day_key = k
                    break
            if not day_key or day_key not in days_dict:
                continue

            # Extract date if present, e.g. "пн, 5 окт" -> "5 окт"
            if "," in raw_title:
                days_dict[day_key]["date"] = raw_title.split(",", 1)[1].strip()

            for el in item.get("lessonElements", []):
                subj = (el.get("subject") or "").strip()
                if not subj:
                    continue
                t_idx = el.get("timeIndex", 1)
                t_str = times[t_idx] if t_idx < len(times) else "09:45 - 11:20"
                t_str = t_str.replace("—", " - ")
                stype_raw = (el.get("studyType") or "").strip().lower()
                stype = type_map.get(stype_raw, el.get("studyType") or "Занятие")

                room_raw = el.get("room", "")
                r_num, b_num = parse_room_building(room_raw)
                teacher = (el.get("teacher") or "").strip()

                days_dict[day_key]["lessons"].append({
                    "pair": t_idx,
                    "time": t_str,
                    "subject": subj,
                    "type": stype,
                    "room": r_num,
                    "building": b_num,
                    "teacher": teacher,
                    "rawRoom": room_raw
                })
        return {"name": label, "days": days_dict}

    from datetime import datetime, timedelta
    now = datetime.now()
    now_str = now.strftime("%H:%M %d.%m.%Y")

    # Fall semester starts Sep 1. Spring semester starts Feb 9.
    start_sem = datetime(now.year, 9, 1) if now.month >= 8 else datetime(now.year, 2, 9)
    start_monday = start_sem - timedelta(days=start_sem.weekday())
    curr_monday = now - timedelta(days=now.weekday())
    week_num = max(1, (curr_monday - start_monday).days // 7 + 1)
    is_current_even = (week_num % 2 == 0)

    curr_parity = "Чётная" if is_current_even else "Нечётная"
    next_parity = "Нечётная" if is_current_even else "Чётная"

    curr_raw_list = raw_data.get("currentWeek", [])
    next_raw_list = raw_data.get("nextWeek", [])

    # raw_data['currentWeek'] is the active calendar week (Week 6: Чётная / Знаменатель)
    # raw_data['nextWeek'] is the upcoming calendar week (Week 7: Нечётная / Числитель)
    if is_current_even:
        even_raw = curr_raw_list
        odd_raw = next_raw_list
    else:
        odd_raw = curr_raw_list
        even_raw = next_raw_list

    even_week_data = process_week(even_raw, f"{week_num if is_current_even else week_num + 1} неделя (Чётная)")
    odd_week_data = process_week(odd_raw, f"{week_num + 1 if is_current_even else week_num} неделя (Нечётная)")

    # Знаменатель (denominator) = Чётная неделя (6 неделя)
    # Числитель (numerator) = Нечётная неделя (7 неделя)
    denominator_data = even_week_data
    numerator_data = odd_week_data

    return {
        "group": group_name,
        "faculty": "НГТУ им. Р.Е. Алексеева",
        "semester": f"Учебный семестр {now.year}/{now.year + 1}",
        "lastSync": now_str,
        "currentWeekNum": week_num,
        "isCurrentEven": is_current_even,
        "weeks": {
            "numerator": numerator_data,
            "denominator": denominator_data,
            "even": even_week_data,
            "odd": odd_week_data,
            "current": even_week_data if is_current_even else odd_week_data,
            "next": odd_week_data if is_current_even else even_week_data
        }
    }


class AppServer(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WORKSPACE_ROOT, **kwargs)

    def log_message(self, format, *args):
        pass

    def translate_path(self, path):
        clean = urllib.parse.unquote(urllib.parse.urlsplit(path).path).lstrip("/")
        parts = clean.split("/")

        search_dirs = []
        if getattr(sys, 'frozen', False):
            if hasattr(sys, '_MEIPASS'):
                search_dirs.append(sys._MEIPASS)
            search_dirs.append(os.path.dirname(sys.executable))
        search_dirs.append(WORKSPACE_ROOT)

        for base in search_dirs:
            candidate = os.path.join(base, *parts)
            if os.path.exists(candidate):
                return candidate

        return super().translate_path(path)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path

        if clean_path in ("/", "", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/src/index.html")
            self.end_headers()
            return

        if clean_path == "/api/news":
            self.handle_get_news()
            return
        elif clean_path == "/api/schedule/groups":
            self.handle_get_groups()
            return
        elif clean_path == "/api/schedule/group":
            self.handle_get_group_schedule(parsed.query)
            return
        elif clean_path == "/api/schedule/screenshot":
            self.handle_get_screenshot(parsed.query)
            return

        super().do_GET()

    def do_POST(self):
        clean_path = urllib.parse.urlparse(self.path).path
        if clean_path == "/api/lks/login":
            self.handle_lks_login()
            return
        elif clean_path == "/api/notify":
            self.handle_notify()
            return
        elif clean_path == "/api/alarm":
            self.handle_alarm()
            return
        elif clean_path == "/api/open-external":
            self.handle_open_external()
            return

        self.send_response(404)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def handle_get_groups(self):
        """Returns the full live list of student groups from NNTU official API"""
        cache_file = os.path.join(WORKSPACE_ROOT, "app_assets", "groups_cache.json")
        groups = []

        # 1. Fetch live groups from NNTU API
        ok, body = fetch_nntu_curl("https://my-api.nntu.ru/lesson-schedule/public/groups", timeout_sec=6)
        if ok and body and body.strip().startswith("["):
            try:
                groups = json.loads(body)
                if isinstance(groups, list) and len(groups) > 0:
                    os.makedirs(os.path.dirname(cache_file), exist_ok=True)
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(groups, f, ensure_ascii=False)
            except Exception as e:
                print("Groups parse error:", e)

        # 2. Fallback to cache if live request failed
        if not groups and os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    groups = json.load(f)
            except Exception:
                pass

        # 3. Fallback to catalog keys if needed
        if not groups:
            cat_file = os.path.join(WORKSPACE_ROOT, "src", "data", "groups_catalog.json")
            if os.path.exists(cat_file):
                try:
                    with open(cat_file, "r", encoding="utf-8") as f:
                        groups = list(json.load(f).keys())
                except Exception:
                    pass

        self.send_json(groups)

    def handle_get_group_schedule(self, query_string):
        """Fetches live schedule for a specific group from my-api.nntu.ru"""
        params = urllib.parse.parse_qs(query_string)
        group_name = params.get("name", [""])[0].strip()

        if not group_name:
            self.send_json({"success": False, "error": "Не указано имя группы"}, status=400)
            return

        cache_dir = os.path.join(WORKSPACE_ROOT, "app_assets", "schedules")
        os.makedirs(cache_dir, exist_ok=True)
        safe_name = "".join(c for c in group_name if c.isalnum() or c in ("-", "_", "(", ")"))
        cache_file = os.path.join(cache_dir, f"{safe_name}.json")

        enc_group = urllib.parse.quote(group_name)
        url = f"https://my-api.nntu.ru/lesson-schedule/public/group-schedule?groupName={enc_group}"

        ok, body = fetch_nntu_curl(url, timeout_sec=8)
        if ok and body and body.strip().startswith("{"):
            try:
                raw_data = json.loads(body)
                converted = convert_nntu_schedule(raw_data, group_name)
                # Save to cache safely
                try:
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(converted, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass

                self.send_json({
                    "success": True,
                    "source": "live_api",
                    "group": group_name,
                    "schedule": converted
                })
                return
            except Exception as e:
                print("Schedule conversion error:", e)

        # Fallback to cached group schedule
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    sched = json.load(f)
                self.send_json({
                    "success": True,
                    "source": "cache",
                    "group": group_name,
                    "schedule": sched
                })
                return
            except Exception:
                pass

        # Fallback to catalog
        cat_file = os.path.join(WORKSPACE_ROOT, "src", "data", "groups_catalog.json")
        if os.path.exists(cat_file):
            try:
                with open(cat_file, "r", encoding="utf-8") as f:
                    cat = json.load(f)
                if group_name in cat:
                    self.send_json({
                        "success": True,
                        "source": "catalog",
                        "group": group_name,
                        "schedule": cat[group_name]
                    })
                    return
            except Exception:
                pass

        self.send_json({
            "success": False,
            "error": f"Не удалось загрузить расписание для группы {group_name}. Проверьте подключение к интернету."
        })

    def handle_get_screenshot(self, query_string):
        """Generates or retrieves high-definition screenshot for student group"""
        params = urllib.parse.parse_qs(query_string)
        group_name = params.get("name", ["26-ИВТ-4-1"])[0].strip() or "26-ИВТ-4-1"
        safe_name = "".join(c for c in group_name if c.isalnum() or c in ("-", "_"))
        out_png = os.path.join(WORKSPACE_ROOT, f"расписание_{safe_name}.png")

        if not os.path.exists(out_png):
            try:
                from capture_schedule_screenshot import capture_group_schedule
                capture_group_schedule(group_name, out_png)
            except Exception as e:
                print("Screenshot generation error:", e)

        if os.path.exists(out_png):
            import base64
            with open(out_png, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            data_url = f"data:image/png;base64,{b64}"
            self.send_json({
                "success": True,
                "group": group_name,
                "dataUrl": data_url
            })
        else:
            self.send_json({
                "success": False,
                "error": f"Не удалось сгенерировать скриншот для группы {group_name}"
            })

    def handle_lks_login(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(body)
            username = req_data.get("login", "").strip()
            password = req_data.get("password", "").strip()

            if not username:
                self.send_json({"success": False, "error": "Пожалуйста, введите логин или номер зачетки/студенческого"})
                return

            # Check identifier on official auth02.nntu.ru
            ok, resp_str = fetch_nntu_curl(
                "https://auth02.nntu.ru/api/v1/auth/check_identifier",
                method="POST",
                data_dict={"identifier": username},
                timeout_sec=6
            )

            is_active = True
            student_info = None

            if ok and resp_str:
                try:
                    data = json.loads(resp_str)
                    if data.get("statusCode") == 403 or "Пользователь не найден" in resp_str:
                        self.send_json({
                            "success": False,
                            "error": "Студент с таким логином не найден в базе университета НГТУ."
                        })
                        return
                    if data.get("is_active") is not None:
                        is_active = data.get("is_active")
                except Exception:
                    pass

            from datetime import datetime
            now_str = datetime.now().strftime("%H:%M %d.%m.%Y")

            self.send_json({
                "success": True,
                "studentName": f"Студент ({username})",
                "login": username,
                "isActive": is_active,
                "lastSync": now_str
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_open_external(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(body)
            url = req_data.get("url", "")
            if url and (url.startswith("http://") or url.startswith("https://")):
                webbrowser.open(url)
                self.send_json({"success": True})
            else:
                self.send_json({"success": False, "error": "Invalid URL protocol"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_get_news(self):
        news_file = os.path.join(WORKSPACE_ROOT, "app_assets", "news.json")
        data = []
        if os.path.exists(news_file):
            try:
                with open(news_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                pass
        self.send_json(data[:9])

    def handle_notify(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(body)
            title = req_data.get("title", "НГТУ Расписание")
            msg = req_data.get("message", "Напоминание о паре")
            send_windows_toast(title, msg)
            self.send_json({"success": True})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_alarm(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(body)
            hour = int(req_data.get("hour", 8))
            minute = int(req_data.get("minute", 0))
            message = str(req_data.get("message", "НГТУ: Первая пара"))
            time_str = f"{hour:02d}:{minute:02d}"
            send_windows_toast("⏰ Будильник к первой паре", f"Время подъёма: {time_str}\n{message}")
            try:
                subprocess.Popen(["cmd.exe", "/c", "start", "ms-clock:"], **WIN_SUBPROCESS_KWARGS)
            except Exception:
                pass
            self.send_json({"success": True, "time": time_str})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})


def find_browser_app_executable():
    """Finds installed Edge or Chrome to run in isolated desktop application window mode"""
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        shutil.which("msedge.exe"),
        shutil.which("msedge"),
        shutil.which("chrome.exe"),
        shutil.which("chrome")
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


def create_app_server():
    global PORT
    for p in range(54321, 54350):
        try:
            srv = HTTPServer(('127.0.0.1', p), AppServer)
            PORT = p
            return srv
        except OSError:
            continue
    srv = HTTPServer(('127.0.0.1', 0), AppServer)
    PORT = srv.server_port
    return srv


def main():
    server = create_app_server()
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    url = f"http://127.0.0.1:{PORT}/src/index.html"

    exe_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else WORKSPACE_ROOT
    profile_dir = os.path.join(os.environ.get("LOCALAPPDATA", exe_dir), "NNTU_Map_Profile")
    os.makedirs(profile_dir, exist_ok=True)

    # 1. Real Native Desktop Window via Edge WebView2 (pywebview)
    try:
        import webview
        webview.create_window(
            title="NNTU Map & Schedule",
            url=url,
            maximized=True,
            min_size=(900, 600)
        )
        webview.start(debug=False, private_mode=False, storage_path=profile_dir)
        return
    except Exception as e:
        pass

    # 2. Standalone app mode fallback
    browser_exe = find_browser_app_executable()

    if browser_exe:
        cmd = [
            browser_exe,
            f"--app={url}",
            f"--user-data-dir={profile_dir}",
            "--start-maximized",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--app-id=nntu_map_schedule"
        ]
        try:
            t0 = time.time()
            proc = subprocess.Popen(cmd, **WIN_SUBPROCESS_KWARGS)
            proc.wait()
            if time.time() - t0 < 3:
                while True:
                    time.sleep(1)
            return
        except Exception as e:
            pass

    # Secondary server keepalive loop
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

