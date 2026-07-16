import os
import sqlite3
import urllib.parse
import time
import requests

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mileage_history.db")
BASE_URL = "https://underwood1.yonsei.ac.kr"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"{BASE_URL}/com/lgin/SsoCtr/initExtPageWork.do?link=handbList&locale=ko"
}

def main():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    
    # Ensure room and evaluation columns exist in courses table
    cursor = conn.cursor()
    columns = [row[1] for row in cursor.execute("PRAGMA table_info(courses)").fetchall()]
    if "room" not in columns:
        print("Adding 'room' column to courses table...")
        conn.execute("ALTER TABLE courses ADD COLUMN room TEXT;")
    if "evaluation" not in columns:
        print("Adding 'evaluation' column to courses table...")
        conn.execute("ALTER TABLE courses ADD COLUMN evaluation TEXT;")
    conn.commit()

    # Load all departments
    depts = conn.execute("SELECT college, code, name FROM departments").fetchall()
    print(f"Loaded {len(depts)} departments from database.")

    # Request params template
    params_template = {
        "_menuId": "MTA5MzM2MTI3MjkzMTI2NzYwMDA=",
        "_pgmId": "NDE0MDA4NTU1NjY=",
        "@d1#syy": "2026",
        "@d1#smtDivCd": "20",
        "@d1#campsBusnsCd": "s1",
        "@d1#hy": "",
        "@d1#cdt": "%",
        "@d1#kwdDivCd": "1",
        "@d1#searchGbn": "1",
        "@d1#kwd": "",
        "@d1#allKwd": "",
        "@d1#engChg": "",
        "@d1#prnGbn": "false",
        "@d1#lang": "",
        "@d1#campsDivCd": "",
        "@d1#stuno": "",
        "@d#": "@d1#",
        "@d1#": "dmCond",
        "@d1#tp": "dm"
    }

    url = f"{BASE_URL}/sch/sles/SlessyCtr/findAtnlcHandbList.do"
    
    updated_count = 0
    start_time = time.time()
    
    for idx, (college, dept_code, dept_name) in enumerate(depts, 1):
        print(f"[{idx}/{len(depts)}] Crawling {dept_name} ({dept_code}) under {college}...")
        
        params = params_template.copy()
        params["@d1#univCd"] = college
        params["@d1#faclyCd"] = dept_code
        payload_str = urllib.parse.urlencode(params)
        
        for retry in range(3):
            try:
                res = requests.post(url, data=payload_str, headers=HEADERS, timeout=8)
                if res.status_code == 200:
                    data = res.json()
                    courses = data.get("dsSles251", [])
                    if courses:
                        for c in courses:
                            code = c.get("subjtnb")
                            div = c.get("corseDvclsNo")
                            room = c.get("lecrmNm")
                            evaluation = c.get("gradeEvlMthdDivNm")
                            if code and div:
                                conn.execute(
                                    "UPDATE courses SET room = ?, evaluation = ? WHERE course_code = ? AND division = ?",
                                    (room, evaluation, code, div)
                                )
                                updated_count += 1
                        conn.commit()
                        print(f"  -> Successfully updated {len(courses)} courses.")
                    break
                else:
                    print(f"  -> HTTP Error {res.status_code}, retrying...")
            except Exception as e:
                print(f"  -> Connection error: {e}, retrying...")
                time.sleep(1)
        
        time.sleep(0.3)
        
    conn.close()
    elapsed = time.time() - start_time
    print(f"\nFinished! Updated a total of {updated_count} course records in {elapsed:.1f} seconds.")

if __name__ == "__main__":
    main()
