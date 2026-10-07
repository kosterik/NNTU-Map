"""
Schedule Screenshot Generator & Exporter for NNTU (НГТУ им. Р.Е. Алексеева)
Generates high-resolution PNG screenshot of the weekly timetable for any student group
using Edge headless renderer or HTML export.
Created by kosterik
"""

import os
import sys
import json
import urllib.parse
import subprocess
import shutil

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(os.path.join(WORKSPACE_ROOT, "desktop"))

from app_desktop import fetch_nntu_curl, convert_nntu_schedule, find_browser_app_executable

def generate_schedule_html(schedule_data, group_name):
    num_week = schedule_data.get("weeks", {}).get("numerator", {})
    days = num_week.get("days", {})

    days_html = ""
    day_names = [
        ("1", "Понедельник"),
        ("2", "Вторник"),
        ("3", "Среда"),
        ("4", "Четверг"),
        ("5", "Пятница"),
        ("6", "Суббота")
    ]

    for d_key, d_name in day_names:
        day_obj = days.get(d_key, {})
        lessons = day_obj.get("lessons", [])
        
        cards_html = ""
        if not lessons:
            cards_html = """
            <div style="padding: 16px; color: #8b949e; font-size: 13px; text-align: center; border: 1px dashed #30363d; border-radius: 6px;">
                Занятий нет
            </div>
            """
        else:
            for l in lessons:
                stype = l.get("type", "Занятие")
                type_color = "#79c0ff" if "лек" in stype.lower() else ("#e3b341" if "практ" in stype.lower() else "#d2a8ff")
                type_bg = "rgba(31,111,235,0.15)" if "лек" in stype.lower() else ("rgba(210,153,34,0.15)" if "практ" in stype.lower() else "rgba(188,140,255,0.15)")
                teacher = l.get("teacher", "")
                room = l.get("room", "")
                bld = l.get("building", "1")

                cards_html += f"""
                <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 14px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; font-weight: 700; color: #8b949e;">{l.get('pair')} ПАРА • {l.get('time')}</span>
                        <span style="font-size: 11px; font-weight: 600; background: {type_bg}; color: {type_color}; padding: 2px 8px; border-radius: 9999px;">{stype}</span>
                    </div>
                    <div style="font-size: 14px; font-weight: 600; color: #f0f6fc; margin-bottom: 6px;">
                        {l.get('subject')}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #8b949e;">
                        <span>{teacher}</span>
                        <span style="font-family: monospace; color: #58a6ff; background: #010409; border: 1px solid #30363d; padding: 2px 8px; border-radius: 4px;">
                            📍 {room} (к.{bld})
                        </span>
                    </div>
                </div>
                """

        days_html += f"""
        <div style="flex: 1; min-width: 320px; max-width: 380px;">
            <div style="font-size: 14px; font-weight: 700; color: #58a6ff; padding-bottom: 8px; border-bottom: 2px solid #30363d; margin-bottom: 12px; display: flex; justify-content: space-between;">
                <span>{d_name}</span>
                <span style="color: #8b949e; font-size: 12px; font-weight: normal;">{len(lessons)} пар</span>
            </div>
            {cards_html}
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Расписание {group_name}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            background-color: #0d1117;
            color: #f0f6fc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 24px;
        }}
        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 16px;
            border-bottom: 1px solid #30363d;
            margin-bottom: 24px;
        }}
        .grid {{
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1 style="font-size: 22px; font-weight: 700;">НГТУ им. Р.Е. Алексеева — Расписание занятий</h1>
            <p style="color: #8b949e; font-size: 13px; margin-top: 4px;">Учебный семестр 2026/2027 • Числитель</p>
        </div>
        <div style="background: #1f6feb; color: white; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: 700;">
            Группа {group_name}
        </div>
    </div>
    <div class="grid">
        {days_html}
    </div>
</body>
</html>
"""

def capture_group_schedule(group_name="26-ИВТ-4-1", output_png=None):
    if not output_png:
        safe_name = "".join(c for c in group_name if c.isalnum() or c in ("-", "_"))
        output_png = os.path.join(WORKSPACE_ROOT, f"расписание_{safe_name}.png")

    print(f"[*] Получение расписания для {group_name} с my-api.nntu.ru...")
    enc = urllib.parse.quote(group_name)
    ok, body = fetch_nntu_curl(f"https://my-api.nntu.ru/lesson-schedule/public/group-schedule?groupName={enc}", timeout_sec=8)

    schedule_data = None
    if ok and body and body.strip().startswith("{"):
        try:
            raw = json.loads(body)
            schedule_data = convert_nntu_schedule(raw, group_name)
        except Exception as e:
            print("Conversion error:", e)

    if not schedule_data:
        # Check cache
        cache_file = os.path.join(WORKSPACE_ROOT, "app_assets", "schedules", f"{group_name}.json")
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                schedule_data = json.load(f)

    if not schedule_data:
        print(f"[!] Не удалось загрузить расписание для группы {group_name}")
        return None

    html_content = generate_schedule_html(schedule_data, group_name)
    temp_html = os.path.join(WORKSPACE_ROOT, ".temp_schedule_screenshot.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    browser = find_browser_app_executable()
    if not browser:
        print("[!] Браузер Edge/Chrome не найден")
        return None

    print(f"[*] Создание скриншота расписания высокого разрешения: {output_png}...")
    file_url = f"file:///{temp_html.replace(os.sep, '/')}"
    cmd = [
        browser,
        "--headless",
        "--disable-gpu",
        f"--screenshot={output_png}",
        "--window-size=1280,960",
        "--hide-scrollbars",
        file_url
    ]

    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if os.path.exists(temp_html):
            os.remove(temp_html)
        if os.path.exists(output_png):
            print(f"[OK] Скриншот успешно сохранен в: {output_png}")
            return output_png
    except Exception as e:
        print("Screenshot error:", e)
    return None

if __name__ == "__main__":
    grp = sys.argv[1] if len(sys.argv) > 1 else "26-ИВТ-4-1"
    capture_group_schedule(grp)
