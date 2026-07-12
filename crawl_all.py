"""
crawl_all.py — 연세대 전체 학부 과목 마일리지 이력 크롤러
==========================================================
Yonsei 학사포털 API를 순회하여 전체 대학 → 학과 → 과목 → 분반별
마일리지 신청/선발 이력을 수집하고 SQLite에 저장합니다.

사용법
------
    python crawl_all.py                    # 전체 크롤 (2~4시간)
    python crawl_all.py --college s1103    # 특정 대학만
    python crawl_all.py --resume           # 이미 크롤된 분반은 skip
    python crawl_all.py --test             # 첫 대학 첫 학과 5과목만 테스트

저장 위치: yonsei-timetable/mileage_history.db
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import time
import urllib.parse
from pathlib import Path
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------------

DB_PATH = Path(__file__).parent / "mileage_history.db"
LOG_PATH = Path(__file__).parent / "crawl_all.log"

BASE_URL = "https://underwood1.yonsei.ac.kr"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"{BASE_URL}/com/lgin/SsoCtr/initExtPageWork.do?link=handbList&locale=ko",
}
MENU_ID  = "MTA5MzM2MTI3MjkzMTI2NzYwMDA="
PGM_ID   = "NDE0MDA4NTU1NjY="

# 수강신청 대상 학기 목록 (이미 결과가 확정된 학기들)
TARGET_YEARS     = ["2026", "2025", "2024", "2023"]
TARGET_SEMESTERS = ["10", "20"]   # 10=1학기, 20=2학기
CRAWL_YEAR       = "2026"         # 과목 편람 조회 기준 학기
CRAWL_SEMESTER   = "20"

REQUEST_DELAY   = 0.35   # 요청 간격 (초)
REQUEST_TIMEOUT = 12     # 요청 타임아웃 (초)
MAX_RETRIES     = 3      # 실패 시 재시도 횟수

# ---------------------------------------------------------------------------
# 로깅
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
    ],
)
logger = logging.getLogger("crawler")

# ---------------------------------------------------------------------------
# DB 초기화
# ---------------------------------------------------------------------------

def init_db(conn: sqlite3.Connection) -> None:
    """필요한 테이블을 생성합니다 (이미 존재하면 skip)."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS colleges (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS departments (
            code      TEXT NOT NULL,
            college   TEXT NOT NULL,
            name      TEXT NOT NULL,
            PRIMARY KEY (code, college)
        );

        CREATE TABLE IF NOT EXISTS courses (
            course_code    TEXT NOT NULL,
            division       TEXT NOT NULL,
            college        TEXT,
            dept           TEXT,
            title          TEXT,
            credits        INTEGER,
            grade          TEXT,
            classification TEXT,
            professor      TEXT,
            time_slot      TEXT,
            campus         TEXT,
            PRIMARY KEY (course_code, division)
        );

        CREATE TABLE IF NOT EXISTS mileage_summary (
            course_code       TEXT NOT NULL,
            division          TEXT NOT NULL,
            year              TEXT NOT NULL,
            semester          TEXT NOT NULL,
            capacity          INTEGER,
            applicants        INTEGER,
            min_mileage       REAL,
            avg_mileage       REAL,
            max_mileage       REAL,
            max_allowed       REAL,
            major_ratio       TEXT,
            year_quotas       TEXT,   -- JSON string
            PRIMARY KEY (course_code, division, year, semester)
        );

        CREATE TABLE IF NOT EXISTS mileage_bids (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            course_code    TEXT NOT NULL,
            division       TEXT NOT NULL,
            year           TEXT NOT NULL,
            semester       TEXT NOT NULL,
            rank           INTEGER,
            mileage        REAL,
            major          TEXT,
            grade          TEXT,
            first_time     TEXT,
            grad           TEXT,
            applied_courses INTEGER,
            earned_ratio   TEXT,
            last_sem_ratio TEXT,
            success        TEXT,
            remark         TEXT
        );

        CREATE TABLE IF NOT EXISTS crawl_status (
            course_code  TEXT NOT NULL,
            division     TEXT NOT NULL,
            status       TEXT NOT NULL,  -- 'done' | 'no_data' | 'error'
            crawled_at   REAL,
            PRIMARY KEY (course_code, division)
        );

        CREATE INDEX IF NOT EXISTS idx_bids_course ON mileage_bids(course_code, division);
        CREATE INDEX IF NOT EXISTS idx_summary_course ON mileage_summary(course_code, division);
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# HTTP 헬퍼
# ---------------------------------------------------------------------------

def post(url: str, params: dict, retries: int = MAX_RETRIES) -> Optional[dict]:
    """URL에 POST 요청을 보내고 JSON을 반환합니다. 실패 시 재시도."""
    for attempt in range(retries):
        try:
            res = requests.post(
                url,
                data=urllib.parse.urlencode(params),
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            logger.warning("  요청 실패 (attempt %d/%d): %s", attempt + 1, retries, e)
            time.sleep(REQUEST_DELAY * (attempt + 1))
    return None


def _base_params() -> dict:
    return {
        "_menuId": MENU_ID,
        "_menuNm": "",
        "_pgmId": PGM_ID,
        "@d#": "@d1#",
        "@d1#": "dmCond",
        "@d1#tp": "dm",
    }


# ---------------------------------------------------------------------------
# API 호출 함수
# ---------------------------------------------------------------------------

def fetch_colleges(year: str = CRAWL_YEAR, semester: str = CRAWL_SEMESTER) -> list[dict]:
    params = {**_base_params(),
        "@d1#dsNm": "dsUnivCd", "@d1#level": "B",
        "@d1#lv1": "s1", "@d1#lv2": "%", "@d1#lv3": "%",
        "@d1#sysinstDivCd": "%", "@d1#univGbn": "A",
        "@d1#findAuthGbn": "8", "@d1#syy": year,
        "@d1#smtDivCd": semester,
    }
    data = post(f"{BASE_URL}/sch/sles/SlescsCtr/findSchSlesHandbList.do", params)
    if not data:
        return []
    return [{"code": c["deptCd"], "name": c["deptNm"]} for c in data.get("dsUnivCd", [])]


def fetch_departments(college: str, year: str = CRAWL_YEAR, semester: str = CRAWL_SEMESTER) -> list[dict]:
    params = {**_base_params(),
        "@d1#dsNm": "dsFaclyCd", "@d1#level": "B",
        "@d1#lv1": "s1", "@d1#lv2": college, "@d1#lv3": "%",
        "@d1#sysinstDivCd": "%", "@d1#univGbn": "A",
        "@d1#findAuthGbn": "8", "@d1#syy": year,
        "@d1#smtDivCd": semester,
    }
    data = post(f"{BASE_URL}/sch/sles/SlescsCtr/findSchSlesHandbList.do", params)
    if not data:
        return []
    return [{"code": d["deptCd"], "name": d["deptNm"]} for d in data.get("dsFaclyCd", [])]


def fetch_courses(college: str, dept: str, year: str = CRAWL_YEAR, semester: str = CRAWL_SEMESTER) -> list[dict]:
    params = {**_base_params(),
        "@d1#syy": year, "@d1#smtDivCd": semester,
        "@d1#campsBusnsCd": "s1", "@d1#univCd": college,
        "@d1#faclyCd": dept, "@d1#hy": "", "@d1#cdt": "%",
        "@d1#kwdDivCd": "1", "@d1#searchGbn": "1",
        "@d1#kwd": "", "@d1#allKwd": "", "@d1#engChg": "",
        "@d1#prnGbn": "false", "@d1#lang": "", "@d1#campsDivCd": "",
        "@d1#stuno": "",
    }
    data = post(f"{BASE_URL}/sch/sles/SlessyCtr/findAtnlcHandbList.do", params)
    if not data:
        return []
    return [
        {
            "course_code": c.get("subjtnb", ""),
            "division":    c.get("corseDvclsNo", ""),
            "title":       c.get("subjtNm", ""),
            "credits":     int(c.get("cdt", 3) or 3),
            "grade":       c.get("hy", ""),
            "classification": c.get("subsrtDivNm", ""),
            "professor":   c.get("cgprfNm", ""),
            "time_slot":   c.get("lctreTimeNm", ""),
        }
        for c in data.get("dsSles251", [])
        if c.get("subjtnb") and c.get("corseDvclsNo")
    ]


def fetch_mileage_semesters(code: str, division: str, sysinst: str = "H1") -> list[dict]:
    params = {**_base_params(),
        "@d1#sysinstDivCd": sysinst,
        "@d1#subjtnb": code, "@d1#corseDvclsNo": division,
        "@d1#prctsCorseDvclsNo": "00",
    }
    data = post(f"{BASE_URL}/sch/sles/SlessyCtr/findMlgSyySmtDivCdList.do", params)
    if not data:
        return []
    sems = data.get("dsSyySmtDivCd", [])
    # 과거 학기만 (TARGET_YEARS 내)
    return [s for s in sems if s.get("syy") in TARGET_YEARS and s.get("smtDivCd") in TARGET_SEMESTERS]


def fetch_mileage_summary(code: str, division: str, year: str, semester: str, sysinst: str = "H1") -> Optional[dict]:
    params = {**_base_params(),
        "@d1#sysinstDivCd": sysinst,
        "@d1#subjtnb": code, "@d1#corseDvclsNo": division,
        "@d1#prctsCorseDvclsNo": "00",
        "@d1#syy": year, "@d1#smtDivCd": semester,
    }
    data = post(f"{BASE_URL}/sch/sles/SlessyCtr/findMlgAppcsResltList.do", params)
    if not data:
        return None
    items = data.get("dsSles251", [])
    if not items:
        return None
    r = items[0]
    import json
    return {
        "capacity":    int(r.get("atnlcPercpCnt", 0) or 0),
        "applicants":  int(r.get("cnt", 0) or 0),
        "min_mileage": float(r.get("minMlg", 0) or 0),
        "avg_mileage": float(r.get("avgMlg", 0) or 0),
        "max_mileage": float(r.get("maxMlg", 0) or 0),
        "max_allowed": float(r.get("usePosblMaxMlgVal", 36) or 36),
        "major_ratio": r.get("mjrprPercpCnt", ""),
        "year_quotas": json.dumps({
            "1": int(r.get("sy1PercpCnt", 0) or 0),
            "2": int(r.get("sy2PercpCnt", 0) or 0),
            "3": int(r.get("sy3PercpCnt", 0) or 0),
            "4": int(r.get("sy4PercpCnt", 0) or 0),
        }),
    }


def fetch_mileage_bids(code: str, division: str, year: str, semester: str, sysinst: str = "H1") -> list[dict]:
    params = {**_base_params(),
        "@d1#sysinstDivCd": sysinst,
        "@d1#subjtnb": code, "@d1#corseDvclsNo": division,
        "@d1#prctsCorseDvclsNo": "00",
        "@d1#syy": year, "@d1#smtDivCd": semester,
    }
    data = post(f"{BASE_URL}/sch/sles/SlessyCtr/findMlgRankResltList.do", params)
    if not data:
        return []
    return [
        {
            "rank":            int(rb.get("mlgRank", 0) or 0) + 1,
            "mileage":         float(rb.get("mlgVal", 0) or 0),
            "major":           rb.get("mjsbjYn", ""),
            "grade":           rb.get("hy", ""),
            "first_time":      rb.get("fratlcYn", "N"),
            "grad":            rb.get("grdtnAplyYn", "N"),
            "applied_courses": int(rb.get("aplySubjcCnt", 0) or 0),
            "earned_ratio":    rb.get("ttCmpsjGrdtnCmpsjCdt", ""),
            "last_sem_ratio":  rb.get("jstbfSmtCmpsjAtnlcPosblCdt", ""),
            "success":         rb.get("mlgAppcsPrcesDivNm", "N"),
            "remark":          rb.get("remrk", ""),
        }
        for rb in data.get("dsSles440", [])
    ]


# ---------------------------------------------------------------------------
# DB 저장 함수
# ---------------------------------------------------------------------------

def save_course(conn: sqlite3.Connection, course: dict, college: str, dept: str) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO courses
        (course_code, division, college, dept, title, credits, grade, classification, professor, time_slot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        course["course_code"], course["division"],
        college, dept,
        course.get("title"), course.get("credits"),
        course.get("grade"), course.get("classification"),
        course.get("professor"), course.get("time_slot"),
    ))


def save_summary(conn: sqlite3.Connection, code: str, division: str, year: str, semester: str, s: dict) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO mileage_summary
        (course_code, division, year, semester, capacity, applicants,
         min_mileage, avg_mileage, max_mileage, max_allowed, major_ratio, year_quotas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        code, division, year, semester,
        s["capacity"], s["applicants"],
        s["min_mileage"], s["avg_mileage"], s["max_mileage"],
        s["max_allowed"], s["major_ratio"], s["year_quotas"],
    ))


def save_bids(conn: sqlite3.Connection, code: str, division: str, year: str, semester: str, bids: list) -> None:
    # 이미 저장된 bids는 삭제 후 재삽입
    conn.execute(
        "DELETE FROM mileage_bids WHERE course_code=? AND division=? AND year=? AND semester=?",
        (code, division, year, semester)
    )
    conn.executemany("""
        INSERT INTO mileage_bids
        (course_code, division, year, semester, rank, mileage, major, grade,
         first_time, grad, applied_courses, earned_ratio, last_sem_ratio, success, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        (code, division, year, semester,
         b["rank"], b["mileage"], b["major"], b["grade"],
         b["first_time"], b["grad"], b["applied_courses"],
         b["earned_ratio"], b["last_sem_ratio"], b["success"], b["remark"])
        for b in bids
    ])


def mark_crawl_status(conn: sqlite3.Connection, code: str, division: str, status: str) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO crawl_status (course_code, division, status, crawled_at)
        VALUES (?, ?, ?, ?)
    """, (code, division, status, time.time()))
    conn.commit()


def is_already_crawled(conn: sqlite3.Connection, code: str, division: str) -> bool:
    row = conn.execute(
        "SELECT status FROM crawl_status WHERE course_code=? AND division=?",
        (code, division)
    ).fetchone()
    return row is not None and row[0] in ("done", "no_data")


# ---------------------------------------------------------------------------
# 분반 크롤 (핵심 단위)
# ---------------------------------------------------------------------------

def crawl_section(conn: sqlite3.Connection, code: str, division: str, resume: bool) -> str:
    """
    단일 분반의 마일리지 이력을 크롤하여 DB에 저장합니다.

    Returns
    -------
    'done' | 'no_data' | 'skip' | 'error'
    """
    if resume and is_already_crawled(conn, code, division):
        return "skip"

    semesters = fetch_mileage_semesters(code, division)
    time.sleep(REQUEST_DELAY)

    if not semesters:
        mark_crawl_status(conn, code, division, "no_data")
        return "no_data"

    total_bids = 0
    for sem in semesters:
        year, semester = sem["syy"], sem["smtDivCd"]

        summary = fetch_mileage_summary(code, division, year, semester)
        time.sleep(REQUEST_DELAY)
        if not summary or summary["capacity"] == 0:
            continue

        save_summary(conn, code, division, year, semester, summary)

        bids = fetch_mileage_bids(code, division, year, semester)
        time.sleep(REQUEST_DELAY)
        if bids:
            save_bids(conn, code, division, year, semester, bids)
            total_bids += len(bids)

    conn.commit()
    status = "done" if total_bids > 0 else "no_data"
    mark_crawl_status(conn, code, division, status)
    return status


# ---------------------------------------------------------------------------
# 메인 크롤 루프
# ---------------------------------------------------------------------------

def crawl(
    target_college: Optional[str] = None,
    resume: bool = True,
    test_mode: bool = False,
) -> None:
    """전체 크롤을 실행합니다."""

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    init_db(conn)

    # 1. 대학 목록
    logger.info("대학 목록 조회 중…")
    colleges = fetch_colleges()
    if not colleges:
        logger.error("대학 목록 조회 실패. 종료.")
        return
    logger.info("  %d개 대학 발견.", len(colleges))
    conn.executemany(
        "INSERT OR REPLACE INTO colleges (code, name) VALUES (?, ?)",
        [(c["code"], c["name"]) for c in colleges]
    )
    conn.commit()

    if target_college:
        colleges = [c for c in colleges if c["code"] == target_college]
        logger.info("  → 필터 적용: %s", target_college)

    stats = {"total": 0, "done": 0, "no_data": 0, "skip": 0, "error": 0}

    for college in colleges:
        logger.info("\n[%s] %s", college["code"], college["name"])
        time.sleep(REQUEST_DELAY)

        # 2. 학과 목록
        depts = fetch_departments(college["code"])
        if not depts:
            logger.warning("  학과 없음. skip.")
            continue
        logger.info("  %d개 학과", len(depts))
        conn.executemany(
            "INSERT OR REPLACE INTO departments (code, college, name) VALUES (?, ?, ?)",
            [(d["code"], college["code"], d["name"]) for d in depts]
        )
        conn.commit()
        time.sleep(REQUEST_DELAY)

        for dept in depts:
            logger.info("  [%s] %s", dept["code"], dept["name"])
            time.sleep(REQUEST_DELAY)

            # 3. 과목 목록
            courses = fetch_courses(college["code"], dept["code"])
            if not courses:
                logger.info("    과목 없음.")
                continue
            logger.info("    %d개 과목-분반", len(courses))

            # 테스트 모드: 5개만
            if test_mode:
                courses = courses[:5]

            for course in courses:
                code = course["course_code"]
                div  = course["division"]
                if not code or not div:
                    continue

                save_course(conn, course, college["code"], dept["code"])

                result = crawl_section(conn, code, div, resume=resume)
                stats["total"] += 1
                stats[result if result in stats else "error"] += 1

                if result == "done":
                    logger.debug("    ✓ %s-%s", code, div)
                elif result == "skip":
                    pass  # 이미 크롤됨
                elif result == "no_data":
                    logger.debug("    - %s-%s (이력 없음)", code, div)
                else:
                    logger.warning("    ✗ %s-%s (%s)", code, div, result)

                time.sleep(REQUEST_DELAY)

            if test_mode:
                logger.info("  [테스트 모드] 첫 학과 완료 후 종료.")
                break

        if test_mode:
            logger.info("[테스트 모드] 첫 대학 완료 후 종료.")
            break

    conn.close()

    logger.info(
        "\n크롤 완료: 총 %d 분반 | 성공 %d | 이력없음 %d | skip %d | 오류 %d",
        stats["total"], stats["done"], stats["no_data"], stats["skip"], stats["error"]
    )


# ---------------------------------------------------------------------------
# 진행 상황 요약 (별도 실행 가능)
# ---------------------------------------------------------------------------

def print_stats() -> None:
    """DB 현재 상태를 출력합니다."""
    if not DB_PATH.exists():
        print("DB 없음.")
        return
    conn = sqlite3.connect(DB_PATH)
    n_courses   = conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
    n_summaries = conn.execute("SELECT COUNT(DISTINCT course_code||division) FROM mileage_summary").fetchone()[0]
    n_bids      = conn.execute("SELECT COUNT(*) FROM mileage_bids").fetchone()[0]
    n_done      = conn.execute("SELECT COUNT(*) FROM crawl_status WHERE status='done'").fetchone()[0]
    n_no_data   = conn.execute("SELECT COUNT(*) FROM crawl_status WHERE status='no_data'").fetchone()[0]
    conn.close()
    print(f"과목-분반 수:      {n_courses:,}")
    print(f"마일리지 이력 있음: {n_summaries:,} (분반 기준)")
    print(f"총 입찰 데이터:    {n_bids:,} 행")
    print(f"크롤 완료:         {n_done:,}")
    print(f"이력 없음:         {n_no_data:,}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="연세대 마일리지 이력 전체 크롤러")
    parser.add_argument("--college",  help="특정 대학 코드만 크롤 (ex: s1103)")
    parser.add_argument("--resume",   action="store_true", default=True,
                        help="이미 크롤된 분반 skip (기본: True)")
    parser.add_argument("--no-resume",dest="resume", action="store_false")
    parser.add_argument("--test",     action="store_true", help="테스트 모드 (소량만)")
    parser.add_argument("--stats",    action="store_true", help="DB 통계만 출력")
    args = parser.parse_args()

    if args.stats:
        print_stats()
    else:
        logger.info("=== 연세대 마일리지 크롤러 시작 ===")
        logger.info("DB: %s", DB_PATH)
        crawl(
            target_college=args.college,
            resume=args.resume,
            test_mode=args.test,
        )
