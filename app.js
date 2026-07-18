// State Management
let coursesData = [];      // Crawled course list
let selectedCourses = [];  // Timetable courses
let myProfile = {          // Mileage Profile
  firstMajor: 'math',      // math, stats, other
  secondMajor: 'none',     // none, math, stats, other
  grade: '3',              // Grade (1-4)
  maxTotalMileage: 76,     // 총 마일리지 예산 (72 또는 76)
  coursesCount: 6,
  gradApp: 'N',
  firstTime: 'Y',
  earnedCredits: 95,
  reqCredits: 130,
  lastCredits: 18,
  maxCredits: 18,
  // ── 7단계 동점자 처리 필드 (엔진 연동) ──────────────────────────────
  applied_credits: 18,     // 이번 학기 신청 총 학점 (3단계)
  is_graduating: false,    // 졸업예정자 (4단계) — gradApp 'Y'와 동기화
  enrolled_semesters: 5,   // 재학 학기 수 (7단계)
  // ── 최적화 제약 조건 필드 ──────────────────────────────────────────
  targetCredits: 9,        // 최소 확보 목표 학점
  targetProb: 0.85         // 보장 확률
};
const YONSEI_MAJORS = {
  "math": { name: "수학과", prefixes: ["MAT"] },
  "stats": { name: "응용통계학과", prefixes: ["STA"] },
  "biz": { name: "경영학과", prefixes: ["BIZ"] },
  "eco": { name: "경제학부", prefixes: ["ECO"] },
  "csi": { name: "컴퓨터과학과", prefixes: ["CSI"] },
  "eee": { name: "전기전자공학부", prefixes: ["EEE"] },
  "meu": { name: "기계공학부", prefixes: ["MEU"] },
  "chb": { name: "화공생명공학부", prefixes: ["CHB"] },
  "mse": { name: "신소재공학부", prefixes: ["MSE"] },
  "arc": { name: "건축공학과", prefixes: ["ARC"] },
  "urb": { name: "도시공학과", prefixes: ["URB"] },
  "cee": { name: "토목환경공학과", prefixes: ["CEE"] },
  "iie": { name: "산업공학과", prefixes: ["IIE"] },
  "sec": { name: "시스템반도체공학과", prefixes: ["SEC"] },
  "ded": { name: "디스플레이융합공학과", prefixes: ["DED"] },
  "phy": { name: "물리학과", prefixes: ["PHY"] },
  "che": { name: "화학과", prefixes: ["CHE"] },
  "ess": { name: "지구시스템과학과", prefixes: ["ESS"] },
  "ast": { name: "천문우주학과", prefixes: ["AST"] },
  "atm": { name: "대기과학과", prefixes: ["ATM"] },
  "lsb": { name: "시스템생물학과", prefixes: ["LSB"] },
  "bch": { name: "생화학과", prefixes: ["BCH"] },
  "bte": { name: "생명공학과", prefixes: ["BTE"] },
  "tai": { name: "인공지능학과", prefixes: ["TAI"] },
  "kor": { name: "국어국문학과", prefixes: ["KOR"] },
  "chi": { name: "중어중문학과", prefixes: ["CHI"] },
  "ell": { name: "영어영문학과", prefixes: ["ELL"] },
  "ger": { name: "독어독문학과", prefixes: ["GER"] },
  "fre": { name: "불어불문학과", prefixes: ["FRE"] },
  "rus": { name: "노어노문학과", prefixes: ["RUS"] },
  "his": { name: "사학과", prefixes: ["HIS"] },
  "phi": { name: "철학과", prefixes: ["PHI"] },
  "lis": { name: "문헌정보학과", prefixes: ["LIS"] },
  "psy": { name: "심리학과", prefixes: ["PSY"] },
  "pos": { name: "정치외교학과", prefixes: ["POS"] },
  "pub": { name: "행정학과", prefixes: ["PUB"] },
  "sow": { name: "사회복지학과", prefixes: ["SOW"] },
  "soc": { name: "사회학과", prefixes: ["SOC"] },
  "ant": { name: "문화인류학과", prefixes: ["ANT"] },
  "coy": { name: "언론홍보영상학부", prefixes: ["COY"] },
  "nur": { name: "간호학과", prefixes: ["NUR"] },
  "med": { name: "의학과", prefixes: ["MED"] },
  "den": { name: "치의학과", prefixes: ["DEN"] },
  "pha": { name: "약학과", prefixes: ["PHA"] },
  "ped": { name: "체육교육학과", prefixes: ["PED"] },
  "sps": { name: "스포츠응용산업학과", prefixes: ["SPS"] },
  "edu": { name: "교육학과", prefixes: ["EDU"] },
  "fnu": { name: "식품영양학과", prefixes: ["FNU"] },
  "cfs": { name: "아동가족학과", prefixes: ["CFS"] },
  "cld": { name: "생활디자인학과", prefixes: ["CLD"] },
  "cte": { name: "의류환경학과", prefixes: ["CTE"] },
  "int": { name: "통합디자인학과", prefixes: ["INT"] },
  "gle": { name: "글로벌엘리트학부", prefixes: ["GLE"] },
  "udc": { name: "언더우드학부", prefixes: ["UDC", "UIC"] },
  "ise": { name: "융합과학공학부", prefixes: ["ISE"] },
  "asd": { name: "융합사회과학부", prefixes: ["ASD"] },
  "other": { name: "기타전공", prefixes: [] }
};

let activeCourseCode = null; // Global cache of the course code currently analyzed
let activeCourseObject = null; // Global cache of the full course object currently analyzed
let precomputedCurves = null; // Precalculated curves for all course-sections
let aiChartInstance = null;   // Chart.js instance for AI probability curve
let wishlist = [];            // Starred courses (Wishlist sandbox)

// DJB2 문자열 해싱 헬퍼 (글자 한 자만 달라져도 색조가 겹치지 않고 완전히 분산되도록 보장)
function getHashCode(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}


// Load precomputed curves from server (cache-friendly static JSON)
async function loadPrecomputedCurves() {
  try {
    const res = await fetch('/precomputed_curves.json');
    if (!res.ok) throw new Error("Failed to load curves");
    precomputedCurves = await res.json();
    console.log("Precomputed curves loaded successfully. Sections:", Object.keys(precomputedCurves.curves).length);
  } catch (err) {
    console.error("Could not load precomputed curves:", err);
  }
}

// Map days to grid column indexes (column 1 is period labels, columns 2-6 are Mon-Fri)
const DAY_MAP = { '월': 2, '화': 3, '수': 4, '목': 5, '금': 6, '토': 7 };
const DAY_NAMES = { 2: '월', 3: '화', 4: '수', 5: '목', 6: '금', 7: '토' };

const YONSEI_CLASSIFICATIONS = [
  "교기", "대교", "자율", "RC", "공기", "필교", "선교", "일반", "전기", "전선", 
  "교직", "전필", "UICE", "CC", "ME", "MB", "MR", "전공", "공통", "선택", 
  "학기", "학필", "계기", "학선"
];
let selectedClassifications = [...YONSEI_CLASSIFICATIONS];

const CREDIT_OPTIONS = [
  { value: "0", label: "0학점" },
  { value: "0.5", label: "0.5학점" },
  { value: "1", label: "1학점" },
  { value: "2", label: "2학점" },
  { value: "3", label: "3학점" },
  { value: "4+", label: "4학점 이상" }
];
let selectedCredits = CREDIT_OPTIONS.map(opt => opt.value);

const GRADE_OPTIONS = [
  { value: "1", label: "1학년" },
  { value: "2", label: "2학년" },
  { value: "3", label: "3학년" },
  { value: "4", label: "4학년" },
  { value: "other", label: "기타" }
];
let selectedGrades = GRADE_OPTIONS.map(opt => opt.value);

const EVAL_OPTIONS = [
  { value: "상대평가", label: "상대평가" },
  { value: "절대평가", label: "절대평가" },
  { value: "P/NP", label: "P/NP (PF)" }
];
let selectedEvals = EVAL_OPTIONS.map(opt => opt.value);

const CLASSROOM_OPTIONS = [
  { value: "공A", label: "공A (제1공학관)" },
  { value: "공B", label: "공B (제2공학관)" },
  { value: "공C", label: "공C (제3공학관)" },
  { value: "상본", label: "상본 (대우관 본관)" },
  { value: "상별", label: "상별 (대우관 별관)" },
  { value: "위", label: "위당관" },
  { value: "외", label: "외솔관" },
  { value: "경", label: "경영관" },
  { value: "연", label: "연희관" },
  { value: "과", label: "과학관" },
  { value: "과S", label: "과학원" },
  { value: "광", label: "광복관" },
  { value: "광별", label: "광별 (광복관 별관)" },
  { value: "음A", label: "음A (음악관 A)" },
  { value: "음B", label: "음B (음악관 B)" },
  { value: "삼", label: "삼성관" },
  { value: "신", label: "원두우신학관" },
  { value: "교", label: "교육과학관" },
  { value: "간", label: "간호대학" },
  { value: "의", label: "의과대학" },
  { value: "치", label: "치과대학" },
  { value: "백", label: "백양관" },
  { value: "학", label: "학술정보관" },
  { value: "중", label: "중앙도서관" },
  { value: "체", label: "체육관" },
  { value: "학회", label: "학생회관" },
  { value: "대", label: "대강당" },
  { value: "박", label: "백주년기념관" },
  { value: "새", label: "새천년관" },
  { value: "공원", label: "연세공학원" },
  { value: "상남", label: "상남경영관" },
  { value: "국", label: "국제학사" },
  { value: "자A", label: "자A (자유관 A)" },
  { value: "자B", label: "자B (자유관 B)" },
  { value: "진A", label: "진A (진리관 A)" },
  { value: "진B", label: "진B (진리관 B)" },
  { value: "진C", label: "진C (진리관 C)" },
  { value: "진D", label: "진D (진리관 D)" },
  { value: "종", label: "종합관" },
  { value: "언기", label: "언더우드기념도서관" },
  { value: "온라인", label: "온라인/동영상" }
];
let selectedClassrooms = CLASSROOM_OPTIONS.map(opt => opt.value);
let selectedTimeSlots = new Set(); // Day-Hour strings, e.g. "월-9"

// ─── localStorage TTL Cache ──────────────────────────────────────────────────
// 브라우저 측 캐시: 백엔드 API 요청 자체를 생략해 응답 속도를 대폭 향상합니다.
const LS_TTL = {
  courses:  6  * 60 * 60 * 1000,  // 6시간 (ms)
  mileage:  24 * 60 * 60 * 1000,  // 24시간
  colleges: 7  * 24 * 60 * 60 * 1000, // 7일
  departments: 7 * 24 * 60 * 60 * 1000,
};

function lsGet(key, type = 'courses') {
  try {
    const raw = localStorage.getItem('ymu_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > (LS_TTL[type] ?? LS_TTL.courses)) return null;
    return data;
  } catch { return null; }
}

function lsSet(key, data) {
  try {
    localStorage.setItem('ymu_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // localStorage 용량 초과 시 오래된 캐시 제거 후 재시도
    clearOldCache();
    try { localStorage.setItem('ymu_' + key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }
}

function clearOldCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('ymu_'));
  // 가장 오래된 항목부터 절반 삭제
  keys.sort((a, b) => {
    try { return JSON.parse(localStorage.getItem(a)).ts - JSON.parse(localStorage.getItem(b)).ts; }
    catch { return 0; }
  });
  keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
}


function populateMajorOptions() {
  const firstSelect = document.getElementById('profile-first-major');
  const secondSelect = document.getElementById('profile-second-major');
  if (!firstSelect || !secondSelect) return;

  firstSelect.innerHTML = '';
  secondSelect.innerHTML = '';

  // Add 'none' to second major options
  const noneOpt = document.createElement('option');
  noneOpt.value = 'none';
  noneOpt.textContent = '없음';
  secondSelect.appendChild(noneOpt);

  Object.entries(YONSEI_MAJORS).forEach(([key, info]) => {
    const opt1 = document.createElement('option');
    opt1.value = key;
    opt1.textContent = info.name;
    firstSelect.appendChild(opt1);

    if (key !== 'other') { // Avoid adding duplicate other/none in second major
      const opt2 = document.createElement('option');
      opt2.value = key;
      opt2.textContent = info.name;
      secondSelect.appendChild(opt2);
    }
  });
  
  // Also add 'other' option to second select
  const otherOpt = document.createElement('option');
  otherOpt.value = 'other';
  otherOpt.textContent = '기타전공';
  secondSelect.appendChild(otherOpt);
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  populateMajorOptions();
  // Automatic cache invalidation for new database version
  const CACHE_VERSION = 'v1.2.9';
  if (localStorage.getItem('ymu_cache_version') !== CACHE_VERSION) {
    Object.keys(localStorage).forEach(k => {
      // Keep user preferences / saved data (wishlist, theme)
      if (k.startsWith('ymu_') && k !== 'ymu_theme' && k !== 'ymu_wishlist') {
        localStorage.removeItem(k);
      }
    });
    localStorage.setItem('ymu_cache_version', CACHE_VERSION);
  }

  // Restore saved theme configuration or fallback to system preference
  const savedTheme = localStorage.getItem('ymu_theme');
  const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const activeTheme = savedTheme || (isSystemDark ? 'dark' : 'light');
  
  // Set HTML theme attribute explicitly
  document.documentElement.setAttribute('data-theme', activeTheme);
  
  initTimetableCalendar();
  initClassificationMultiselect();
  initCreditsMultiselect();
  initGradeMultiselect();
  initEvaluationMultiselect();
  initRoomMultiselect();
  initTimeFilterGrid();
  loadDataFromStorage();
  loadWishlist(); // Restore starred courses sandbox
  
  // Sync the theme icon on load
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.setAttribute('data-lucide', activeTheme === 'dark' ? 'sun' : 'moon');
  }

  await loadPrecomputedCurves(); // Load static precomputed curves first
  await initSearchFilters(); // Dynamically load colleges/departments first
  setupEventListeners();
  initMiniTimetableCalendar();
  switchTab('tab-timetable');
  lucide.createIcons();
});


// 특정 슬롯이 가상 동영상 슬롯(중복수강 가능)인지 체크하는 함수
function isSlotVirtual(c, s) {
  const specificRoom = getRoomForDay(c.time, c.room, s.day);
  if (specificRoom) {
    const cleanRoom = specificRoom.replace(/\s+/g, '');
    if (cleanRoom.includes('동영상콘텐츠') || cleanRoom === '동영상' || cleanRoom.includes('동영상컨텐츠')) {
      if (!cleanRoom.includes('중복수강불가')) {
        return true; // 가상 동영상 슬롯 (시간표 미노출, 중복수강 가능)
      }
    }
  }
  return false;
}

// 시간표 범위(요일 및 최대 교시)를 동적으로 계산하는 함수
function getActiveTimetableLimits() {
  const activeDays = ['월', '화', '수', '목', '금'];
  let maxPeriod = 10;
  let hasSaturday = false;

  selectedCourses.forEach(c => {
    const slots = parseTimeSlots(c.time);
    slots.forEach(s => {
      if (!isSlotVirtual(c, s)) {
        if (s.day === '토') {
          hasSaturday = true;
        }
        if (s.period > maxPeriod) {
          maxPeriod = s.period;
        }
      }
    });
  });

  if (hasSaturday) {
    activeDays.push('토');
  }

  return { activeDays, maxPeriod };
}

// Generate timetable grid dynamically based on active days and max period
function initTimetableCalendar() {
  const calendar = document.getElementById('timetable-calendar');
  if (!calendar) return;

  const { activeDays, maxPeriod } = getActiveTimetableLimits();

  // CSS Grid columns & rows 동적 적용
  calendar.style.gridTemplateColumns = `60px repeat(${activeDays.length}, minmax(130px, 1fr))`;
  calendar.style.gridTemplateRows = `40px repeat(${maxPeriod}, 50px)`;

  calendar.innerHTML = '';

  // Corner cell
  const corner = document.createElement('div');
  corner.className = 'grid-cell day-header corner-cell';
  calendar.appendChild(corner);

  // Day headers (월~금, 필요시 토 추가)
  activeDays.forEach(day => {
    const header = document.createElement('div');
    header.className = 'grid-cell day-header';
    header.textContent = day;
    calendar.appendChild(header);
  });

  // Periods rows (1교시부터 maxPeriod교시까지)
  for (let p = 1; p <= maxPeriod; p++) {
    // 9시부터 1시간 간격 표시 (p교시 -> 8 + p 시 시작)
    const hour = 8 + p;
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    const labelCell = document.createElement('div');
    labelCell.className = 'grid-cell period-cell';
    labelCell.innerHTML = `<strong>${p}</strong><span>${timeStr}</span>`;
    labelCell.style.gridColumn = '1';
    labelCell.style.gridRow = `${p + 1}`;
    calendar.appendChild(labelCell);

    // Empty grid cells for day columns
    for (let dayCol = 2; dayCol < 2 + activeDays.length; dayCol++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell empty-grid-cell';
      cell.style.gridColumn = `${dayCol}`;
      cell.style.gridRow = `${p + 1}`;
      
      const dayName = activeDays[dayCol - 2];
      cell.dataset.day = dayName;
      cell.dataset.period = p;
      calendar.appendChild(cell);
    }
  }
}


// Fetch Courses from backend API with advanced sub-tab routing
async function fetchCourses() {

  const college = document.getElementById('select-college').value;
  const dept = document.getElementById('select-dept').value;
  const listContainer = document.getElementById('search-results-list');
  const campus = document.getElementById('select-campus')?.value || '';
  const lsKey = `courses_${college}_${dept}_${campus}`;

  // Helper function to dispatch processed courses array
  function dispatchCourses(rawList) {
    let processed = [...rawList];
    renderCourses(processed);
  }

  // L0: check browser localStorage cache
  const lsCached = lsGet(lsKey, 'courses');
  if (lsCached) {
    coursesData = lsCached;
    dispatchCourses(coursesData);
    return;
  }

  listContainer.innerHTML = `
    <div class="list-placeholder">
      <i data-lucide="loader-2" class="spin"></i>
      <p>과목 데이터를 불러오는 중...</p>
    </div>
  `;
  lucide.createIcons();

  try {
    const response = await fetch(`/api/courses?college=${college}&dept=${dept}&campus=${campus}`);
    const data = await response.json();

    if (data.success) {
      coursesData = data.courses;
      lsSet(lsKey, coursesData);  // 브라우저 캐시에 저장
      dispatchCourses(coursesData);
    } else {
      listContainer.innerHTML = `
        <div class="list-placeholder">
          <i data-lucide="alert-triangle" style="color: var(--danger)"></i>
          <p>데이터 로딩 실패: ${data.error}</p>
        </div>
      `;
      lucide.createIcons();
    }
  } catch (err) {
    listContainer.innerHTML = `
      <div class="list-placeholder">
        <i data-lucide="alert-triangle" style="color: var(--danger)"></i>
        <p>네트워크 오류가 발생했습니다.</p>
      </div>
    `;
    lucide.createIcons();
  }
}


// Render Course results list
function renderCourses(courses) {
  const listContainer = document.getElementById('search-results-list');
  const countLabel = document.getElementById('results-count');
  
  const query = document.getElementById('input-search').value.toLowerCase().trim();
  const collegeVal = document.getElementById('select-college')?.value || '';
  const deptVal = document.getElementById('select-dept')?.value || '';

  if (!listContainer) return;

  // 0. If College, Dept, and Search Query are all empty, show a search guide placeholder instead of loading random courses
  if (!collegeVal && !deptVal && !query) {
    listContainer.innerHTML = `
      <div class="list-placeholder">
        <i data-lucide="search" style="color: var(--text-muted)"></i>
        <p>검색어를 입력하거나 대학/학과 필터를 선택하여 과목을 찾아보세요.</p>
      </div>
    `;
    if (countLabel) countLabel.textContent = "조회된 과목 0개";
    lucide.createIcons();
    return;
  }

  // Filter courses by search query and advanced options
  const filtered = courses.filter(c => {
    // 1. Text Search matching
    // 1. Text Search matching
    const titleStr = String(c.title || '').toLowerCase();
    const codeStr = String(c.code || '').toLowerCase();
    const profStr = String(c.professor || '').toLowerCase();
    
    const matchesQuery = titleStr.includes(query) ||
                          codeStr.includes(query) ||
                          profStr.includes(query);
    if (!matchesQuery) return false;

    // 2. Classification (이수구분) matching
    if (selectedClassifications.length > 0 && selectedClassifications.length < YONSEI_CLASSIFICATIONS.length) {
      if (!selectedClassifications.includes(c.classification)) return false;
    } else if (selectedClassifications.length === 0) {
      return false;
    }

    // 3. Credits (학점수) matching
    if (selectedCredits.length > 0 && selectedCredits.length < CREDIT_OPTIONS.length) {
      const match = selectedCredits.some(val => {
        if (val === "4+") {
          return c.credits >= 4;
        }
        return c.credits === parseFloat(val);
      });
      if (!match) return false;
    } else if (selectedCredits.length === 0) {
      return false;
    }

    // 4. Target Grade (대상학년) matching
    if (selectedGrades.length > 0 && selectedGrades.length < GRADE_OPTIONS.length) {
      const gradeStr = String(c.grade || '').trim();
      const hasDigits1To4 = /[1234]/.test(gradeStr);
      let match = false;
      if (!hasDigits1To4) {
        match = selectedGrades.includes("other");
      } else {
        match = selectedGrades.some(val => {
          if (val === "other") return false;
          return gradeStr.includes(val);
        });
      }
      if (!match) return false;
    } else if (selectedGrades.length === 0) {
      return false;
    }

    // 5. Evaluation (평가방식) matching
    if (selectedEvals.length > 0 && selectedEvals.length < EVAL_OPTIONS.length) {
      const evalStr = String(c.evaluation || '');
      const match = selectedEvals.some(val => {
        if (val === 'P/NP') {
          return evalStr === 'P/NP' || evalStr === 'PF' || evalStr === 'P/F';
        }
        return evalStr === val;
      });
      if (!match) return false;
    } else if (selectedEvals.length === 0) {
      return false;
    }

    // 5.5. Classroom (강의실) matching
    if (selectedClassrooms.length > 0 && selectedClassrooms.length < CLASSROOM_OPTIONS.length) {
      const roomStr = String(c.room || '').trim();
      const isOnline = roomStr.includes("동영상") || roomStr.includes("콘텐츠") || roomStr.includes("온라인") || roomStr.includes("인터넷");
      let match = false;
      if (isOnline) {
        match = selectedClassrooms.includes("온라인");
      } else {
        match = selectedClassrooms.some(val => {
          if (val === "온라인") return false;
          return roomStr.startsWith(val);
        });
      }
      if (!match) return false;
    } else if (selectedClassrooms.length === 0) {
      return false;
    }

    // 6. Time Slot (시간 필터) matching
    if (selectedTimeSlots.size > 0) {
      const slots = parseTimeSlots(c.time).filter(s => !isSlotVirtual(c, s));
      if (slots.length === 0) {
        return false;
      }
      const matches = slots.every(s => {
        const hour = s.period + 8;
        const key = `${s.day}-${hour}`;
        return selectedTimeSlots.has(key);
      });
      if (!matches) return false;
    }

    return true;
  });

  if (!listContainer) return;
  if (countLabel) {
    if (filtered.length > 200) {
      countLabel.textContent = `조회된 과목 ${filtered.length}개 중 상위 200개 표시 (필터나 검색어로 좁혀보세요)`;
    } else {
      countLabel.textContent = `조회된 과목 ${filtered.length}개`;
    }
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="list-placeholder">
        <i data-lucide="info"></i>
        <p>검색 결과가 없습니다.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  listContainer.innerHTML = '';
  const displayLimit = 200;
  const toRender = filtered.slice(0, displayLimit);
  toRender.forEach(c => {
    const isAdded = selectedCourses.some(sel => sel.code === c.code && sel.division === c.division);
    const isStarred = wishlist.some(w => w.code === c.code && w.division === c.division);

    // Calculate syllabus URL for direct target="_blank" navigation (bypasses popup blockers in KakaoTalk/Safari)
    const year = c.year || '2026';
    const semester = c.semester || '20';
    const paramsObj = {
      sysinstDivCd: "H1",
      syy: year,
      smtDivCd: semester,
      subjtnb: c.code,
      corseDvclsNo: c.division
    };
    const base64Params = btoa(JSON.stringify(paramsObj));
    const syllabusUrl = `https://underwood1.yonsei.ac.kr/com/lgin/SsoCtr/initExtPageWork.do?link=sylla&params=${base64Params}`;
    
    // Look up ML precomputed curves for AI insights
    const lookupKey = `${c.code}-${c.division}`;
    const curve = precomputedCurves?.curves?.[lookupKey];
    let aiInsightHtml = '';
    
    if (curve) {
      const q50 = curve.major?.grade_3?.median ?? curve.major?.median ?? 12;
      const isEasy = q50 <= 10;
      const isHard = q50 >= 24;
      const badgeColor = isEasy ? '#0070f3' : isHard ? '#ee0000' : '#f5a623';
      const badgeText = isEasy ? '꿀과목 (이지)' : isHard ? '컷오프 주의 (헬)' : '무난함 (노멀)';
      aiInsightHtml = `
        <div class="ai-insight-banner" style="margin-top: 8px; margin-bottom: 8px; padding: 6px 10px; background: var(--canvas-soft); border-radius: 4px; border-left: 3px solid ${badgeColor}; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <span style="font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 4px;">
            <i data-lucide="brain" style="width:12px; height:12px;"></i> ${badgeText}
          </span>
          <span style="color: var(--text-secondary);">예상 커트라인: <strong style="color: var(--ink);">${q50.toFixed(1)}pt</strong></span>
        </div>
      `;
    }

    const div = document.createElement('div');
    div.className = 'course-item';
    div.innerHTML = `
      <div class="course-badge-row" style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 4px; align-items: center;">
          <span class="badge badge-code">${c.code}-${c.division}</span>
          <span class="badge badge-class">${c.classification}</span>
          <span class="badge badge-class">${c.grade}학년</span>
        </div>
        <button class="btn-wishlist ${isStarred ? 'starred-active' : ''}" title="장바구니 담기">
          <i data-lucide="star" style="${isStarred ? 'fill: #ffcc00; stroke: #ffcc00;' : ''}"></i>
        </button>
      </div>
      <div class="course-title-row">
        <h3>${c.title}</h3>
        <div style="display: flex; gap: 6px; align-items: center;">
          <a href="${syllabusUrl}" target="_blank" class="btn-chart-view btn-view-syllabus" title="강의계획서 조회" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; color: inherit;">
            <i data-lucide="book-open"></i>
          </a>
          <button class="btn-chart-view btn-view-analysis" title="마일리지 과거 결과 분석">
            <i data-lucide="bar-chart-2"></i>
          </button>
        </div>
      </div>
      <div class="course-info-grid">
        <span><i data-lucide="user"></i> ${c.professor || '미지정'}</span>
        <span><i data-lucide="clock"></i> ${c.time || '시간 미지정'}</span>
        <span><i data-lucide="map-pin"></i> ${c.room || '강의실 미정'}</span>
        <span><i data-lucide="award"></i> ${c.credits}학점 (${c.evaluation})</span>
      </div>
      ${aiInsightHtml}
      <button class="btn ${isAdded ? 'btn-secondary btn-added-toggle' : 'btn-primary'} btn-add btn-full">
        <i data-lucide="${isAdded ? 'check' : 'plus'}"></i>
        <span class="btn-add-text-normal">${isAdded ? '시간표 추가됨' : '시간표에 추가'}</span>
        ${isAdded ? '<span class="btn-add-text-hover" style="display: none;">시간표에서 제거</span>' : ''}
      </button>
    `;

    // Click handler for add/remove button
    div.querySelector('.btn-add').addEventListener('click', () => {
      if (isAdded) {
        removeCourse(c.code, c.division);
      } else {
        addCourseToTimetable(c);
      }
    });

    // Click handler for wishlist button
    div.querySelector('.btn-wishlist').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(c);
    });

    // Stop propagation on syllabus link click to prevent parent event trigger
    div.querySelector('.btn-view-syllabus').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Click handler for analysis button
    div.querySelector('.btn-view-analysis').addEventListener('click', (e) => {
      e.stopPropagation();
      openMileageAnalysisModal(c);
    });

    listContainer.appendChild(div);
  });
  lucide.createIcons();
}

// Parse Yonsei lecture times (e.g. "월3,4,수3" -> [{day: '월', period: 3}, {day: '월', period: 4}, ...])
function parseTimeSlots(timeStr) {
  if (!timeStr) return [];
  const slots = [];
  // Clean parentheses like "목6(목7)" into comma-separated
  const cleanStr = timeStr.replace(/[\(\)]/g, ',');
  const blocks = cleanStr.split('/');
  
  for (let block of blocks) {
    const regex = /([월화수목금토])([0-9,]+)/g;
    let match;
    while ((match = regex.exec(block)) !== null) {
      const day = match[1];
      const periods = match[2].split(',').filter(p => p !== "").map(Number);
      for (let p of periods) {
        slots.push({ day, period: p });
      }
    }
  }
  return slots;
}

// Add Course to Timetable & check conflicts
function addCourseToTimetable(course) {
  // 가상 동영상(중복수강 가능) 슬롯은 시간표 겹침 체크에서 제외
  const newSlots = parseTimeSlots(course.time).filter(s => !isSlotVirtual(course, s));
  
  // 1. Check for time overlap conflicts
  let conflict = null;
  for (let selected of selectedCourses) {
    const selectedSlots = parseTimeSlots(selected.time).filter(s => !isSlotVirtual(selected, s));
    const hasOverlap = selectedSlots.some(s1 => 
      newSlots.some(s2 => s1.day === s2.day && s1.period === s2.period)
    );
    if (hasOverlap) {
      conflict = selected;
      break;
    }
  }

  if (conflict) {
    alert(`시간표 충돌! [${conflict.title}] 과목과 수업 시간이 겹칩니다.\n(${conflict.time} vs ${course.time})`);
    return;
  }

  // 2. Add course
  const courseWithMileage = { ...course, mileage: 0, isRetake: false, priority: 'medium', mileageSummary: null };
  selectedCourses.push(courseWithMileage);
  
  // Fetch statistics in the background for the advisor
  fetchMileageSummaryForAdvisor(courseWithMileage);
  
  saveDataToStorage();
  renderTimetableGrid();
  renderSelectedCoursesList();
  renderCourses(coursesData); // Refresh lists to show disable button
}

// Remove Course from Timetable
function removeCourse(code, division) {
  selectedCourses = selectedCourses.filter(c => !(c.code === code && c.division === division));
  saveDataToStorage();
  renderTimetableGrid();
  renderSelectedCoursesList();
  renderCourses(coursesData);
}

// 요일별 강의실 매핑 함수 (예: 화5,6/목4 -> 외01/동영상콘텐츠 인 경우 요일에 맞춰 추출)
function getRoomForDay(timeStr, roomStr, targetDay) {
  if (!roomStr) return '';
  if (!timeStr) return roomStr;

  // 강의실 구분이 없을 경우 그대로 반환 (외곽 괄호만 제거)
  if (!roomStr.includes('/')) {
    return roomStr.replace(/^\((.*)\)$/, '$1');
  }

  const timeParts = timeStr.split('/');
  const roomParts = roomStr.split('/');

  if (timeParts.length === roomParts.length) {
    for (let i = 0; i < timeParts.length; i++) {
      const timePart = timeParts[i];
      const cleanTime = timePart.replace(/[\(\)]/g, '');
      if (cleanTime.startsWith(targetDay)) {
        // 내부 괄호는 살리고 전체 감싸는 외곽 괄호만 제거 (예: (과118) -> 과118, 동영상(중복수강불가) -> 동영상(중복수강불가))
        return roomParts[i].replace(/^\((.*)\)$/, '$1');
      }
    }
  }

  // 매핑 실패 시 원본 문자열 반환
  return roomStr;
}

// 전체가 비정규 동영상 콘텐츠/온라인 강의인지 체크하는 함수 (시간표 그리드에 전혀 렌더링되지 않는 과목)
function isEntirelyOnlineCourse(c) {
  const slots = parseTimeSlots(c.time);
  if (slots.length === 0) return true;
  return slots.every(s => isSlotVirtual(c, s));
}

// Render blocks on the visual calendar grid
function renderTimetableGrid() {
  // Re-build the calendar grid dynamically based on selected courses
  initTimetableCalendar();

  const calendar = document.getElementById('timetable-calendar');

  selectedCourses.forEach(c => {
    const slots = parseTimeSlots(c.time);
    
    // Group consecutive slots on the same day to draw a single tall block
    // Sort slots by day and period
    const sorted = [...slots].sort((a, b) => {
      if (a.day !== b.day) return DAY_MAP[a.day] - DAY_MAP[b.day];
      return a.period - b.period;
    });

    const blocks = [];
    if (sorted.length > 0) {
      let currentBlock = { day: sorted[0].day, start: sorted[0].period, end: sorted[0].period };
      
      for (let i = 1; i < sorted.length; i++) {
        const slot = sorted[i];
        if (slot.day === currentBlock.day && slot.period === currentBlock.end + 1) {
          currentBlock.end = slot.period;
        } else {
          blocks.push(currentBlock);
          currentBlock = { day: slot.day, start: slot.period, end: slot.period };
        }
      }
      blocks.push(currentBlock);
    }

    // Draw the blocks on the grid
    blocks.forEach(b => {
      // 가상 동영상(중복수강 가능) 슬롯은 시간표 블록을 그리지 않음
      if (isSlotVirtual(c, { day: b.day })) {
        return;
      }

      // 요일별 해당하는 강의실을 정확히 찾아 매핑
      const specificRoom = getRoomForDay(c.time, c.room, b.day);

      const col = DAY_MAP[b.day];
      const startRow = b.start + 1; // row index offset (period 1 is row 2)
      const span = b.end - b.start + 1;

      // Calculate a highly unique, eye-friendly pastel HSL color based on the theme and course code hash
      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || 
                         (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.getAttribute('data-theme'));
      const hash = getHashCode(c.code);
      const hue = hash % 360;
      
      const s = isDarkMode ? 35 : 60; // Saturated enough in light mode, muted in dark
      const l = isDarkMode ? 18 : 88; // Contrastful 88% pastel for light, deep 18% for dark
      const textCol = isDarkMode ? '#f3f3f3' : '#171717';
      const borderCol = `hsl(${hue}, ${s + 10}%, ${isDarkMode ? 45 : 55}%)`;
      const bgVal = `hsl(${hue}, ${s}%, ${l}%)`;

      const eventBlock = document.createElement('div');
      eventBlock.className = 'timetable-event-block';
      if (span === 1) {
        eventBlock.classList.add('short-block');
      }
      eventBlock.style.gridColumn = `${col} / span 1`;
      eventBlock.style.gridRow = `${startRow} / span ${span}`;
      eventBlock.style.background = bgVal;
      eventBlock.style.color = textCol;
      eventBlock.style.borderLeft = `3.5px solid ${borderCol}`;
      eventBlock.style.boxShadow = 'var(--shadow-whisper)';

      // Add descriptive hover tooltip
      eventBlock.title = `${c.title}\n교수: ${c.professor || '미지정'}\n강의실: ${specificRoom || '미지정'}\n마일리지: ${c.mileage || 0}pt`;

      if (span === 1) {
        eventBlock.innerHTML = `
          <div class="event-title" style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 65%;" title="${c.title}">${c.title}</div>
          <span class="event-mileage-badge" style="margin-top: 0; font-size: 8.5px; padding: 1px 4px;">${c.mileage || 0}pt</span>
        `;
      } else {
        eventBlock.innerHTML = `
          <div class="event-title">${c.title}</div>
          <div class="event-details">
            <span>${c.professor || '미지정'}</span>
            <span style="font-size: 8.5px; opacity: 0.9; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">📍 ${specificRoom || '미지정'}</span>
            <span class="event-mileage-badge" style="margin-top: 4px;">${c.mileage || 0} pt</span>
          </div>
        `;
      }

      // Click block to open course actions context menu!
      eventBlock.addEventListener('click', () => {
        openCourseActionModal(c);
      });

      calendar.appendChild(eventBlock);
    });
  });

  // Update credits count badge
  const totalCdt = selectedCourses.reduce((sum, c) => sum + c.credits, 0);
  const totalCreditsEl = document.getElementById('total-credits');
  if (totalCreditsEl) totalCreditsEl.textContent = `${totalCdt}학점 신청됨`;

  // Render entirely online/video-only courses list at the bottom of the timetable card
  const onlineOnlyCourses = selectedCourses.filter(isEntirelyOnlineCourse);
  const onlineContainer = document.getElementById('online-only-courses-container');
  const onlineList = document.getElementById('online-only-courses-list');

  if (onlineContainer && onlineList) {
    onlineList.innerHTML = '';
    if (onlineOnlyCourses.length > 0) {
      onlineContainer.style.display = 'block';
      onlineOnlyCourses.forEach(c => {
        const badge = document.createElement('div');
        badge.className = 'online-course-badge';
        
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || 
                           (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.getAttribute('data-theme'));
        const hash = getHashCode(c.code);
        const hue = hash % 360;
        const s = isDarkMode ? 35 : 60;
        const l = isDarkMode ? 18 : 88;
        const textCol = isDarkMode ? '#f3f3f3' : '#171717';
        const borderCol = `hsl(${hue}, ${s + 10}%, ${isDarkMode ? 45 : 55}%)`;
        const bgVal = `hsl(${hue}, ${s}%, ${l}%)`;

        badge.style.background = bgVal;
        badge.style.color = textCol;
        badge.style.borderLeft = `3px solid ${borderCol}`;
        badge.style.padding = '5px 9px';
        badge.style.borderRadius = 'var(--border-radius-sm)';
        badge.style.fontSize = '10px';
        badge.style.fontWeight = '500';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '6px';
        badge.style.cursor = 'pointer';
        badge.style.boxShadow = 'var(--shadow-whisper)';
        badge.style.transition = 'transform 0.15s ease, filter 0.15s ease';
        badge.title = `${c.title}\n교수: ${c.professor || '미지정'}\n시간: ${c.time || '시간 미지정'}\n강의실: ${c.room || '인터넷강의'}\n마일리지: ${c.mileage || 0}pt`;

        badge.innerHTML = `
          <span style="font-weight: 700; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.title}</span>
          <span style="opacity: 0.8; font-size: 8.5px; white-space: nowrap;">👤 ${c.professor || '미지정'}</span>
          <span style="opacity: 0.8; font-size: 8.5px; white-space: nowrap;">💻 ${c.room || '인터넷강의'}</span>
          <span class="event-mileage-badge" style="font-size: 8px; padding: 1.5px 4px; margin: 0; background: ${borderCol}; color: #fff; font-weight: 600; border-radius: 3px;">${c.mileage || 0}pt</span>
        `;

        badge.addEventListener('click', () => {
          openCourseActionModal(c);
        });
        
        // Add subtle hover effect
        badge.addEventListener('mouseenter', () => {
          badge.style.transform = 'translateY(-1px)';
          badge.style.filter = 'brightness(1.03)';
        });
        badge.addEventListener('mouseleave', () => {
          badge.style.transform = 'none';
          badge.style.filter = 'none';
        });

        onlineList.appendChild(badge);
      });
      // Re-trigger Lucide icons for the newly added elements
      if (window.lucide) {
        lucide.createIcons();
      }
    } else {
      onlineContainer.style.display = 'none';
    }
  }

  // Always sync mini timetable grid as well
  renderMiniTimetableGrid();
}

// Generate sidebar mini timetable grid dynamically based on active days and max period
function initMiniTimetableCalendar() {
  const calendar = document.getElementById('mini-timetable-calendar');
  if (!calendar) return;

  const { activeDays, maxPeriod } = getActiveTimetableLimits();

  // CSS Grid columns & rows 동적 적용
  calendar.style.gridTemplateColumns = `28px repeat(${activeDays.length}, 1fr)`;
  calendar.style.gridTemplateRows = `24px repeat(${maxPeriod}, 1fr)`;

  calendar.innerHTML = '';
  
  // Header Corner
  const headerCorner = document.createElement('div');
  headerCorner.className = 'grid-cell day-header';
  calendar.appendChild(headerCorner);
  
  activeDays.forEach(d => {
    const header = document.createElement('div');
    header.className = 'grid-cell day-header';
    header.textContent = d;
    calendar.appendChild(header);
  });

  // Draw empty cells for periods 1 to maxPeriod (rows)
  for (let p = 1; p <= maxPeriod; p++) {
    // Row time label
    const label = document.createElement('div');
    label.className = 'grid-cell period-label';
    label.textContent = p;
    calendar.appendChild(label);

    // Empty day cells (Columns 2 to 2 + activeDays.length - 1)
    for (let dayCol = 2; dayCol < 2 + activeDays.length; dayCol++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.style.gridColumn = `${dayCol}`;
      cell.style.gridRow = `${p + 1}`;
      
      const dayName = activeDays[dayCol - 2];
      cell.dataset.day = dayName;
      cell.dataset.period = p;
      calendar.appendChild(cell);
    }
  }
}

// Render Sidebar Mini Timetable Grid blocks dynamically
function renderMiniTimetableGrid() {
  // Re-build the mini calendar grid dynamically based on selected courses
  initMiniTimetableCalendar();

  const calendar = document.getElementById('mini-timetable-calendar');
  if (!calendar) return;

  selectedCourses.forEach(c => {
    const slots = parseTimeSlots(c.time);
    
    // Group consecutive slots on the same day to draw a single tall block
    const sorted = [...slots].sort((a, b) => {
      if (a.day !== b.day) return DAY_MAP[a.day] - DAY_MAP[b.day];
      return a.period - b.period;
    });

    const blocks = [];
    if (sorted.length > 0) {
      let currentBlock = { day: sorted[0].day, start: sorted[0].period, end: sorted[0].period };
      
      for (let i = 1; i < sorted.length; i++) {
        const slot = sorted[i];
        if (slot.day === currentBlock.day && slot.period === currentBlock.end + 1) {
          currentBlock.end = slot.period;
        } else {
          blocks.push(currentBlock);
          currentBlock = { day: slot.day, start: slot.period, end: slot.period };
        }
      }
      blocks.push(currentBlock);
    }

    // Draw the blocks on the grid
    blocks.forEach(b => {
      // 가상 동영상(중복수강 가능) 슬롯은 시간표 블록을 그리지 않음
      if (isSlotVirtual(c, { day: b.day })) {
        return;
      }

      // 요일별 해당하는 강의실을 정확히 찾아 매핑
      const specificRoom = getRoomForDay(c.time, c.room, b.day);

      const col = DAY_MAP[b.day];
      const startRow = b.start + 1; // row index offset (period 1 is row 2)
      const span = b.end - b.start + 1;

      // Unique pastel HSL colors
      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || 
                         (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.getAttribute('data-theme'));
      const hash = getHashCode(c.code);
      const hue = hash % 360;
      
      const s = isDarkMode ? 35 : 60;
      const l = isDarkMode ? 18 : 88;
      const textCol = isDarkMode ? '#f3f3f3' : '#171717';
      const borderCol = `hsl(${hue}, ${s + 10}%, ${isDarkMode ? 45 : 55}%)`;
      const bgVal = `hsl(${hue}, ${s}%, ${l}%)`;

      const eventBlock = document.createElement('div');
      eventBlock.className = 'mini-timetable-event-block';
      eventBlock.dataset.code = c.code;
      eventBlock.dataset.division = c.division;
      eventBlock.style.gridColumn = `${col} / span 1`;
      eventBlock.style.gridRow = `${startRow} / span ${span}`;
      eventBlock.style.background = bgVal;
      eventBlock.style.color = textCol;
      eventBlock.style.borderLeft = `2px solid ${borderCol}`;
      eventBlock.style.boxShadow = 'var(--shadow-whisper)';

      // No visible text inside the mini calendar event block for clean design, but show room in tooltip
      eventBlock.title = `${c.title} (${specificRoom || '미지정'}, ${c.mileage || 0}pt)`;
      eventBlock.innerHTML = '';

      // Click mini block to open course actions context menu!
      eventBlock.addEventListener('click', () => {
        openCourseActionModal(c);
      });

      calendar.appendChild(eventBlock);
    });
  });
}

// Render selected courses list with sliders for mileage allocation
function renderSelectedCoursesList() {
  const container = document.getElementById('selected-courses-container');
  
  if (selectedCourses.length === 0) {
    container.innerHTML = `
      <div class="no-courses-placeholder">
        <i data-lucide="calendar-plus"></i>
        <p>왼쪽 검색창에서 과목을 시간표에 추가한 뒤 마일리지를 분배하세요.</p>
      </div>
    `;
    lucide.createIcons();
    updateMileageLabel();
    return;
  }

  container.innerHTML = '';
  
  // Drag-and-drop source tracking
  let dragEl = null;

  selectedCourses.forEach((c, index) => {
    // Determine course-specific max allowed mileage limit
    const key = `${c.code}-${c.division}`;
    let maxVal = 36;
    if (c.mileageSummary && c.mileageSummary.max_allowed_mileage) {
      maxVal = c.mileageSummary.max_allowed_mileage;
    } else if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key]) {
      maxVal = precomputedCurves.curves[key].max_allowed || 36;
    }

    const prob = getCourseProbability(c, c.mileage || 0);
    const color = prob >= 0.8 ? 'var(--success)' : prob >= 0.5 ? 'var(--warning)' : 'var(--danger)';
    const glow = prob >= 0.8 ? 'var(--success-glow)' : prob >= 0.5 ? 'var(--warning-glow)' : 'var(--danger-glow)';

    // Compute identical gradient color for visual coupling
    const hash = getHashCode(c.code);
    const hue = hash % 360;
    const grad = `linear-gradient(180deg, hsl(${hue}, 68%, 38%) 0%, hsl(${(hue + 35) % 360}, 65%, 28%) 100%)`;

    // Rank styling indicators (1st, 2nd, 3rd get specific highlights)
    const rankColor = index === 0 ? 'var(--danger)' : index === 1 ? 'var(--warning)' : index === 2 ? 'var(--accent-light)' : 'var(--text-secondary)';
    const rankLabel = `${index + 1}순번`;

    // Calculate syllabus URL for direct target="_blank" navigation
    const year = c.year || '2026';
    const semester = c.semester || '20';
    const paramsObj = {
      sysinstDivCd: "H1",
      syy: year,
      smtDivCd: semester,
      subjtnb: c.code,
      corseDvclsNo: c.division
    };
    const base64Params = btoa(JSON.stringify(paramsObj));
    const syllabusUrl = `https://underwood1.yonsei.ac.kr/com/lgin/SsoCtr/initExtPageWork.do?link=sylla&params=${base64Params}`;

    const item = document.createElement('div');
    item.className = 'allocation-item';
    item.draggable = false; // Prevent default drag clashes with input range controls
    item.dataset.key = key;
    
    // Style element during hover/grip
    item.style.position = 'relative';
    item.style.transition = 'border 0.2s ease, opacity 0.2s ease, transform 0.2s ease';

    item.innerHTML = `
      <!-- Left Edge Neon Color Indicator (matches timetable block color) -->
      <div class="course-color-indicator" style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${grad}; border-radius: var(--border-radius-sm) 0 0 var(--border-radius-sm);"></div>

      <!-- Drag Grip Handle -->
      <div class="drag-handle" style="cursor: grab; display: flex; align-items: center; justify-content: center; padding: 0 5px 0 10px; color: var(--text-muted);">
        <i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i>
      </div>
      
      <!-- Rank Index Indicator -->
      <div class="rank-indicator" style="display: flex; align-items: center; justify-content: center; min-width: 50px; font-weight: 800; font-size: 11.5px; color: ${rankColor}; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; padding: 3px 6px; margin-right: 8px;">
        ${rankLabel}
      </div>

      <div class="alloc-info" style="flex: 1;">
        <h4 style="margin: 0; font-size: 13px;">${c.title}</h4>
        <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-secondary);">${c.code}-${c.division} | ${c.professor || '교수 미지정'} | ${c.credits}학점</p>
        <div class="alloc-meta-row" style="display:flex; gap:12px; align-items:center; margin-top:4px;">
          <label class="retake-toggle-label" style="margin-top:0;">
            <input type="checkbox" class="retake-checkbox" ${c.isRetake ? 'checked' : ''}>
            <span>재수강</span>
          </label>
        </div>
      </div>
      <div class="alloc-control-slider" style="flex: 1.5;">
        <input type="range" class="mileage-slider" min="0" max="${maxVal}" value="${c.mileage}">
      </div>
      <div class="alloc-val-box">
        <input type="number" class="mileage-input" min="0" max="${maxVal}" value="${c.mileage}">
      </div>
      <div class="alloc-prob-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:65px; margin-left:6px;">
        <span style="font-size:9px; color:var(--text-muted); margin-bottom:2px;">합격 확률</span>
        <span class="prob-badge" style="font-size:11.5px; font-weight:700; padding:2px 6px; border-radius:4px; color:${color}; background:${glow};">
          ${Math.round(prob * 100)}%
          <div class="tooltip-content" id="tooltip-${c.code}-${c.division}">
            ${getAdvisorSuggestionHTML(c)}
          </div>
        </span>
      </div>
      <a href="${syllabusUrl}" target="_blank" class="btn-selected-syllabus" title="강의계획서 조회" style="text-decoration: none; color: inherit; display: inline-flex; align-items: center; justify-content: center;">
        <i data-lucide="book-open"></i>
      </a>
      <button class="btn-analyze" title="상세 마일리지 통계 분석" style="margin-left: 4px;">
        <i data-lucide="bar-chart-3"></i>
      </button>
      <button class="btn-remove" title="시간표에서 제거">
        <i data-lucide="trash-2"></i>
      </button>
    `;

    const slider = item.querySelector('.mileage-slider');
    const numberInput = item.querySelector('.mileage-input');
    const syllabusBtn = item.querySelector('.btn-selected-syllabus');
    const analyzeBtn = item.querySelector('.btn-analyze');
    const removeBtn = item.querySelector('.btn-remove');
    const retakeCheckbox = item.querySelector('.retake-checkbox');

    // Click handler for syllabus link is handled natively by the anchor tag

    // 헬퍼: 확률 뱃지 및 조언 툴팁 실시간 드래그 동적 업데이트
    function updateProbBadge(val) {
      const p = getCourseProbability(c, val);
      const badge = item.querySelector('.prob-badge');
      if (badge) {
        badge.innerHTML = `
          ${Math.round(p * 100)}%
          <div class="tooltip-content" id="tooltip-${c.code}-${c.division}">
            ${getAdvisorSuggestionHTML(c)}
          </div>
        `;
        badge.style.color = p >= 0.8 ? 'var(--success)' : p >= 0.5 ? 'var(--warning)' : 'var(--danger)';
        badge.style.background = p >= 0.8 ? 'var(--success-glow)' : p >= 0.5 ? 'var(--warning-glow)' : 'var(--danger-glow)';
      }
    }

    // Event listener: Open Mileage Analysis Modal
    analyzeBtn.addEventListener('click', () => {
      openMileageAnalysisModal(c);
    });

    // Event listener: Sync Slider -> Input
    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      numberInput.value = val;
      c.mileage = val;
      updateProbBadge(val);
      updateMileageLabel();
      saveDataToStorage();
    });

    // Event listener: Sync Input -> Slider
    numberInput.addEventListener('change', (e) => {
      let val = parseInt(e.target.value) || 0;
      if (val < 0) val = 0;
      if (val > maxVal) val = maxVal; // Enforce course-specific max allowed mileage
      
      e.target.value = val;
      slider.value = val;
      c.mileage = val;
      updateProbBadge(val);
      updateMileageLabel();
      saveDataToStorage();
    });

    // Event listener: Retake Checkbox Toggle
    retakeCheckbox.addEventListener('change', (e) => {
      c.isRetake = e.target.checked;
      saveDataToStorage();
      runAdvisorDiagnostic();
    });

    // Remove button handler
    removeBtn.addEventListener('click', () => {
      removeCourse(c.code, c.division);
    });

    // ── Drag & Drop Event Handlers ──────────────────────────────────────────
    // Enable dragging ONLY when mousedown on the dedicated grip handle icon
    const gripHandle = item.querySelector('.drag-handle');
    if (gripHandle) {
      gripHandle.addEventListener('mousedown', () => {
        item.draggable = true;
      });
      // Fallbacks to disable draggable when pointer leaves grip area
      gripHandle.addEventListener('mouseup', () => {
        item.draggable = false;
      });
    }

    item.addEventListener('dragstart', (e) => {
      dragEl = item;
      item.style.opacity = '0.4';
      item.style.transform = 'scale(0.98)';
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.draggable = false;
      item.style.opacity = '1';
      item.style.transform = '';
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Draw temporary insertion indicator line
      const rect = item.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      if (relativeY > rect.height / 2) {
        item.style.borderBottom = '2px solid var(--accent-light)';
        item.style.borderTop = '';
      } else {
        item.style.borderTop = '2px solid var(--accent-light)';
        item.style.borderBottom = '';
      }
    });

    item.addEventListener('dragleave', () => {
      item.style.borderTop = '';
      item.style.borderBottom = '';
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.style.borderTop = '';
      item.style.borderBottom = '';
      item.style.opacity = '1';
      item.style.transform = '';

      if (dragEl && dragEl !== item) {
        const dragKey = dragEl.dataset.key;
        const targetKey = item.dataset.key;

        const dragIndex = selectedCourses.findIndex(x => `${x.code}-${x.division}` === dragKey);
        const targetIndex = selectedCourses.findIndex(x => `${x.code}-${x.division}` === targetKey);

        if (dragIndex !== -1 && targetIndex !== -1) {
          // Reorder memory array
          const movingNode = selectedCourses[dragIndex];
          selectedCourses.splice(dragIndex, 1);
          selectedCourses.splice(targetIndex, 0, movingNode);

          saveDataToStorage();
          renderSelectedCoursesList();
          
          // Re-trigger diagnostic advisor check (since priorities shifted!)
          runAdvisorDiagnostic();
        }
      }
    });

    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      item.style.transform = '';
      item.style.borderTop = '';
      item.style.borderBottom = '';
    });

    // ── Hover interaction link to Mini Timetable ─────────────────────────────
    item.addEventListener('mouseenter', () => {
      const miniBlocks = document.querySelectorAll('#mini-timetable-calendar .mini-timetable-event-block');
      miniBlocks.forEach(block => {
        if (block.dataset.code === c.code && block.dataset.division === c.division) {
          block.classList.add('highlight-active');
        }
      });
    });

    item.addEventListener('mouseleave', () => {
      const miniBlocks = document.querySelectorAll('#mini-timetable-calendar .mini-timetable-event-block');
      miniBlocks.forEach(block => {
        block.classList.remove('highlight-active');
      });
    });

    container.appendChild(item);
  });
  
  lucide.createIcons();
  updateMileageLabel();
}

// Update the allocated mileage sum label (dynamic budget: stats=72, others=76)
function updateMileageLabel() {
  const sum = selectedCourses.reduce((sum, c) => sum + c.mileage, 0);
  const label = document.getElementById('allocated-mileage-label');
  const parentBadge = document.querySelector('.mileage-status');
  const maxTotal = myProfile.maxTotalMileage || (myProfile.firstMajor === 'stats' ? 72 : 76);
  
  label.textContent = `${sum} / ${maxTotal}`;

  // Visual warning colors for mileage bounds
  label.classList.remove('warning-state', 'danger-state');
  if (parentBadge) parentBadge.classList.remove('over-budget-active');

  if (sum > maxTotal) {
    label.classList.add('danger-state');
    if (parentBadge) parentBadge.classList.add('over-budget-active');
  } else if (sum === maxTotal) {
    label.classList.add('warning-state'); // perfect allocation
  }

  // Live sync with Timetable Calendar Blocks!
  renderTimetableGrid();

  // Update advisor card diagnostics
  runAdvisorDiagnostic();
}

// 이수구분 멀티셀렉트(체크박스 팝오버) 초기화 함수
function initClassificationMultiselect() {
  const grid = document.querySelector('#classification-popover .checkbox-grid');
  if (!grid) return;

  grid.innerHTML = '';
  YONSEI_CLASSIFICATIONS.forEach(cls => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.fontSize = '10px';
    label.style.color = 'var(--text-primary)';
    label.style.cursor = 'pointer';
    label.style.padding = '2px 0';
    label.style.userSelect = 'none';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = cls;
    cb.checked = true;
    cb.style.cursor = 'pointer';
    cb.style.accentColor = 'var(--accent-light)';
    cb.style.width = '12px';
    cb.style.height = '12px';
    
    cb.addEventListener('change', () => {
      updateClassificationSelection();
    });
    
    label.appendChild(cb);
    label.appendChild(document.createTextNode(cls));
    grid.appendChild(label);
  });

  const triggerBtn = document.getElementById('btn-classification-trigger');
  const popover = document.getElementById('classification-popover');
  
  if (triggerBtn && popover) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popover.style.display === 'none' || popover.style.display === '';
      popover.style.display = isHidden ? 'flex' : 'none';
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
        popover.style.display = 'none';
      }
    });
  }

  document.getElementById('btn-class-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = true);
    updateClassificationSelection();
  });
  
  document.getElementById('btn-class-reset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = false);
    updateClassificationSelection();
  });
}

function updateClassificationSelection() {
  const grid = document.querySelector('#classification-popover .checkbox-grid');
  if (!grid) return;
  
  const cbs = grid.querySelectorAll('input[type="checkbox"]');
  selectedClassifications = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      selectedClassifications.push(cb.value);
    }
  });
  
  // Update trigger button label
  const labelSpan = document.querySelector('#btn-classification-trigger .trigger-label');
  if (labelSpan) {
    if (selectedClassifications.length === YONSEI_CLASSIFICATIONS.length) {
      labelSpan.textContent = "전체";
    } else if (selectedClassifications.length === 0) {
      labelSpan.textContent = "선택 없음";
    } else if (selectedClassifications.length <= 3) {
      labelSpan.textContent = selectedClassifications.join(', ');
    } else {
      labelSpan.textContent = `선택됨 (${selectedClassifications.length}개)`;
    }
  }
  
  // Re-render courses list
  renderCourses(coursesData);
}

// 학점 멀티셀렉트(체크박스 팝오버) 초기화 함수
function initCreditsMultiselect() {
  const grid = document.querySelector('#credits-popover .checkbox-grid');
  if (!grid) return;

  grid.innerHTML = '';
  CREDIT_OPTIONS.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.fontSize = '10px';
    label.style.color = 'var(--text-primary)';
    label.style.cursor = 'pointer';
    label.style.padding = '2px 0';
    label.style.userSelect = 'none';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = opt.value;
    cb.checked = true;
    cb.style.cursor = 'pointer';
    cb.style.accentColor = 'var(--accent-light)';
    cb.style.width = '12px';
    cb.style.height = '12px';
    
    cb.addEventListener('change', () => {
      updateCreditsSelection();
    });
    
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt.label));
    grid.appendChild(label);
  });

  const triggerBtn = document.getElementById('btn-credits-trigger');
  const popover = document.getElementById('credits-popover');
  
  if (triggerBtn && popover) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popover.style.display === 'none' || popover.style.display === '';
      popover.style.display = isHidden ? 'flex' : 'none';
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
        popover.style.display = 'none';
      }
    });
  }

  document.getElementById('btn-credits-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = true);
    updateCreditsSelection();
  });
  
  document.getElementById('btn-credits-reset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = false);
    updateCreditsSelection();
  });
}

function updateCreditsSelection() {
  const grid = document.querySelector('#credits-popover .checkbox-grid');
  if (!grid) return;
  
  const cbs = grid.querySelectorAll('input[type="checkbox"]');
  selectedCredits = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      selectedCredits.push(cb.value);
    }
  });
  
  // Update trigger button label
  const labelSpan = document.querySelector('#btn-credits-trigger .trigger-label');
  if (labelSpan) {
    if (selectedCredits.length === CREDIT_OPTIONS.length) {
      labelSpan.textContent = "전체";
    } else if (selectedCredits.length === 0) {
      labelSpan.textContent = "선택 없음";
    } else if (selectedCredits.length <= 2) {
      const names = selectedCredits.map(val => {
        const found = CREDIT_OPTIONS.find(opt => opt.value === val);
        return found ? found.label : val;
      });
      labelSpan.textContent = names.join(', ');
    } else {
      labelSpan.textContent = `선택됨 (${selectedCredits.length}개)`;
    }
  }
  
  // Re-render courses list
  renderCourses(coursesData);
}

// 학년 멀티셀렉트(체크박스 팝오버) 초기화 함수
function initGradeMultiselect() {
  const grid = document.querySelector('#grade-popover .checkbox-grid');
  if (!grid) return;

  grid.innerHTML = '';
  GRADE_OPTIONS.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.fontSize = '10px';
    label.style.color = 'var(--text-primary)';
    label.style.cursor = 'pointer';
    label.style.padding = '2px 0';
    label.style.userSelect = 'none';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = opt.value;
    cb.checked = true;
    cb.style.cursor = 'pointer';
    cb.style.accentColor = 'var(--accent-light)';
    cb.style.width = '12px';
    cb.style.height = '12px';
    
    cb.addEventListener('change', () => {
      updateGradeSelection();
    });
    
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt.label));
    grid.appendChild(label);
  });

  const triggerBtn = document.getElementById('btn-grade-trigger');
  const popover = document.getElementById('grade-popover');
  
  if (triggerBtn && popover) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popover.style.display === 'none' || popover.style.display === '';
      popover.style.display = isHidden ? 'flex' : 'none';
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
        popover.style.display = 'none';
      }
    });
  }

  document.getElementById('btn-grade-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = true);
    updateGradeSelection();
  });
  
  document.getElementById('btn-grade-reset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = false);
    updateGradeSelection();
  });
}

function updateGradeSelection() {
  const grid = document.querySelector('#grade-popover .checkbox-grid');
  if (!grid) return;
  
  const cbs = grid.querySelectorAll('input[type="checkbox"]');
  selectedGrades = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      selectedGrades.push(cb.value);
    }
  });
  
  // Update trigger button label
  const labelSpan = document.querySelector('#btn-grade-trigger .trigger-label');
  if (labelSpan) {
    if (selectedGrades.length === GRADE_OPTIONS.length) {
      labelSpan.textContent = "전체";
    } else if (selectedGrades.length === 0) {
      labelSpan.textContent = "선택 없음";
    } else if (selectedGrades.length <= 2) {
      const names = selectedGrades.map(val => {
        const found = GRADE_OPTIONS.find(opt => opt.value === val);
        return found ? found.label : val;
      });
      labelSpan.textContent = names.join(', ');
    } else {
      labelSpan.textContent = `선택됨 (${selectedGrades.length}개)`;
    }
  }
  
  // Re-render courses list
  renderCourses(coursesData);
}

// 평가 멀티셀렉트(체크박스 팝오버) 초기화 함수
function initEvaluationMultiselect() {
  const grid = document.querySelector('#evaluation-popover .checkbox-grid');
  if (!grid) return;

  grid.innerHTML = '';
  EVAL_OPTIONS.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.fontSize = '10px';
    label.style.color = 'var(--text-primary)';
    label.style.cursor = 'pointer';
    label.style.padding = '2px 0';
    label.style.userSelect = 'none';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = opt.value;
    cb.checked = true;
    cb.style.cursor = 'pointer';
    cb.style.accentColor = 'var(--accent-light)';
    cb.style.width = '12px';
    cb.style.height = '12px';
    
    cb.addEventListener('change', () => {
      updateEvaluationSelection();
    });
    
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt.label));
    grid.appendChild(label);
  });

  const triggerBtn = document.getElementById('btn-evaluation-trigger');
  const popover = document.getElementById('evaluation-popover');
  
  if (triggerBtn && popover) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popover.style.display === 'none' || popover.style.display === '';
      popover.style.display = isHidden ? 'flex' : 'none';
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
        popover.style.display = 'none';
      }
    });
  }

  document.getElementById('btn-evaluation-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = true);
    updateEvaluationSelection();
  });
  
  document.getElementById('btn-evaluation-reset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = false);
    updateEvaluationSelection();
  });
}

function updateEvaluationSelection() {
  const grid = document.querySelector('#evaluation-popover .checkbox-grid');
  if (!grid) return;
  
  const cbs = grid.querySelectorAll('input[type="checkbox"]');
  selectedEvals = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      selectedEvals.push(cb.value);
    }
  });
  
  // Update trigger button label
  const labelSpan = document.querySelector('#btn-evaluation-trigger .trigger-label');
  if (labelSpan) {
    if (selectedEvals.length === EVAL_OPTIONS.length) {
      labelSpan.textContent = "전체";
    } else if (selectedEvals.length === 0) {
      labelSpan.textContent = "선택 없음";
    } else if (selectedEvals.length <= 2) {
      const names = selectedEvals.map(val => {
        const found = EVAL_OPTIONS.find(opt => opt.value === val);
        return found ? found.label : val;
      });
      labelSpan.textContent = names.join(', ');
    } else {
      labelSpan.textContent = `선택됨 (${selectedEvals.length}개)`;
    }
  }
  
  // Re-render courses list
  renderCourses(coursesData);
}

// 강의실 멀티셀렉트(체크박스 팝오버) 초기화 함수
function initRoomMultiselect() {
  const grid = document.querySelector('#room-popover .checkbox-grid');
  if (!grid) return;

  grid.innerHTML = '';
  CLASSROOM_OPTIONS.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.fontSize = '10px';
    label.style.color = 'var(--text-primary)';
    label.style.cursor = 'pointer';
    label.style.padding = '2px 0';
    label.style.userSelect = 'none';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = opt.value;
    cb.checked = true;
    cb.style.cursor = 'pointer';
    cb.style.accentColor = 'var(--accent-light)';
    cb.style.width = '12px';
    cb.style.height = '12px';
    
    cb.addEventListener('change', () => {
      updateRoomSelection();
    });
    
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt.label));
    grid.appendChild(label);
  });

  const triggerBtn = document.getElementById('btn-room-trigger');
  const popover = document.getElementById('room-popover');
  
  if (triggerBtn && popover) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popover.style.display === 'none' || popover.style.display === '';
      popover.style.display = isHidden ? 'flex' : 'none';
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
        popover.style.display = 'none';
      }
    });
  }

  document.getElementById('btn-room-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = true);
    updateRoomSelection();
  });
  
  document.getElementById('btn-room-reset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const cbs = grid.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = false);
    updateRoomSelection();
  });
}

function updateRoomSelection() {
  const grid = document.querySelector('#room-popover .checkbox-grid');
  if (!grid) return;
  
  const cbs = grid.querySelectorAll('input[type="checkbox"]');
  selectedClassrooms = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      selectedClassrooms.push(cb.value);
    }
  });
  
  // Update trigger button label
  const labelSpan = document.querySelector('#btn-room-trigger .trigger-label');
  if (labelSpan) {
    if (selectedClassrooms.length === CLASSROOM_OPTIONS.length) {
      labelSpan.textContent = "전체";
    } else if (selectedClassrooms.length === 0) {
      labelSpan.textContent = "선택 없음";
    } else if (selectedClassrooms.length <= 2) {
      const names = selectedClassrooms.map(val => {
        const found = CLASSROOM_OPTIONS.find(opt => opt.value === val);
        return found ? found.value : val;
      });
      labelSpan.textContent = names.join(', ');
    } else {
      labelSpan.textContent = `선택됨 (${selectedClassrooms.length}개)`;
    }
  }
  
  // Re-render courses list
  renderCourses(coursesData);
}

// 시간으로 찾기(주간 시간선택 그리드 모달) 초기화 함수
function initTimeFilterGrid() {
  const tbody = document.querySelector('#time-filter-grid-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const days = ['월', '화', '수', '목', '금', '토', '일'];

  for (let hour = 8; hour <= 23; hour++) {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    
    // Hour cell
    const tdHour = document.createElement('td');
    tdHour.style.padding = '6px';
    tdHour.style.borderRight = '1px solid var(--border-color)';
    tdHour.style.fontWeight = '600';
    tdHour.style.color = 'var(--text-secondary)';
    tdHour.textContent = hour;
    tr.appendChild(tdHour);

    // Day cells
    days.forEach((day, index) => {
      const tdDay = document.createElement('td');
      tdDay.style.padding = '6px';
      if (index < days.length - 1) {
        tdDay.style.borderRight = '1px solid var(--border-color)';
      }
      tdDay.style.cursor = 'pointer';
      tdDay.style.transition = 'background-color 0.1s ease';
      tdDay.dataset.day = day;
      tdDay.dataset.hour = hour;
      
      // Hover styles dynamically
      tdDay.addEventListener('mouseenter', () => {
        if (!tdDay.classList.contains('selected-time-cell')) {
          tdDay.style.background = 'var(--canvas-soft)';
        }
      });
      tdDay.addEventListener('mouseleave', () => {
        if (!tdDay.classList.contains('selected-time-cell')) {
          tdDay.style.background = 'transparent';
        }
      });

      tr.appendChild(tdDay);
    });

    tbody.appendChild(tr);
  }

  // Handle cell selection interactions (click-and-drag)
  let isMouseDown = false;
  let isSelecting = true; // true: select, false: deselect

  tbody.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('td[data-day]');
    if (!cell) return;
    
    e.preventDefault();
    isMouseDown = true;
    isSelecting = !cell.classList.contains('selected-time-cell');
    toggleCell(cell, isSelecting);
  });

  tbody.addEventListener('mouseover', (e) => {
    if (!isMouseDown) return;
    const cell = e.target.closest('td[data-day]');
    if (!cell) return;
    
    toggleCell(cell, isSelecting);
  });

  document.addEventListener('mouseup', () => {
    isMouseDown = false;
  });

  function toggleCell(cell, select) {
    if (select) {
      cell.classList.add('selected-time-cell');
    } else {
      cell.classList.remove('selected-time-cell');
    }
  }

  // Modal open/close and apply hooks
  const timeModal = document.getElementById('time-filter-modal');
  const btnOpenTime = document.getElementById('btn-open-time-filter');
  const btnCloseTime = document.getElementById('btn-close-time-modal');
  const btnApplyTime = document.getElementById('btn-apply-time-filter');

  if (btnOpenTime && timeModal) {
    btnOpenTime.addEventListener('click', () => {
      // Sync grid UI with selectedTimeSlots Set on open
      const cells = timeModal.querySelectorAll('td[data-day]');
      cells.forEach(cell => {
        const key = `${cell.dataset.day}-${cell.dataset.hour}`;
        if (selectedTimeSlots.has(key)) {
          cell.classList.add('selected-time-cell');
        } else {
          cell.classList.remove('selected-time-cell');
        }
      });
      timeModal.classList.add('active');
    });
  }

  if (btnCloseTime && timeModal) {
    btnCloseTime.addEventListener('click', () => {
      timeModal.classList.remove('active');
    });
  }

  if (timeModal) {
    timeModal.addEventListener('click', (e) => {
      if (e.target === timeModal) {
        timeModal.classList.remove('active');
      }
    });
  }

  const btnResetTime = document.getElementById('btn-reset-time-filter');
  if (btnResetTime && timeModal) {
    btnResetTime.addEventListener('click', () => {
      const cells = timeModal.querySelectorAll('td[data-day]');
      cells.forEach(cell => {
        cell.classList.remove('selected-time-cell');
        cell.style.background = 'transparent';
      });
    });
  }

  if (btnApplyTime && timeModal) {
    btnApplyTime.addEventListener('click', () => {
      const cells = timeModal.querySelectorAll('td[data-day].selected-time-cell');
      selectedTimeSlots.clear();
      cells.forEach(cell => {
        const key = `${cell.dataset.day}-${cell.dataset.hour}`;
        selectedTimeSlots.add(key);
      });

      // Update time filter button appearance based on count
      const btnLabel = document.getElementById('time-filter-btn-label');
      if (btnLabel && btnOpenTime) {
        if (selectedTimeSlots.size === 0) {
          btnLabel.textContent = "시간선택";
          btnOpenTime.style.borderColor = 'var(--border-color)';
          btnOpenTime.style.color = 'var(--text-primary)';
        } else {
          btnLabel.textContent = `시간선택 (${selectedTimeSlots.size}칸)`;
          btnOpenTime.style.borderColor = 'var(--danger)';
          btnOpenTime.style.color = 'var(--danger)';
        }
      }

      // Live filter course search results
      renderCourses(coursesData);
      timeModal.classList.remove('active');
    });
  }
}

// Event Listeners setup
function setupEventListeners() {
  // Mileage analysis modal tabs toggle handler
  document.querySelectorAll('.mileage-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      
      // Toggle button active classes
      document.querySelectorAll('.mileage-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Toggle tab content visibility
      document.querySelectorAll('.mileage-tab-content').forEach(content => {
        if (content.id === targetId) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });

      // Force Chart.js redraw on tab activation
      if (targetId === 'mileage-tab-ai' && activeCourseObject) {
        const sliderVal = parseInt(document.getElementById('predict-score-slider').value) || 12;
        renderAIProbabilityChart(activeCourseObject, sliderVal);
      }
    });
  });

  // Mileage distribution view toggle handler (Chart vs Table)
  const btnViewChart = document.getElementById('btn-view-chart');
  const btnViewTable = document.getElementById('btn-view-table');
  const mileageChartContainer = document.getElementById('mileage-chart-container');
  const mileageTableContainer = document.getElementById('mileage-table-container');

  if (btnViewChart && btnViewTable) {
    btnViewChart.addEventListener('click', () => {
      btnViewChart.classList.add('active');
      btnViewChart.style.color = 'var(--text-primary)';
      btnViewChart.style.background = 'var(--canvas-elevated)';
      
      btnViewTable.classList.remove('active');
      btnViewTable.style.color = 'var(--text-muted)';
      btnViewTable.style.background = 'none';

      if (mileageChartContainer) mileageChartContainer.style.display = 'block';
      if (mileageTableContainer) mileageTableContainer.style.display = 'none';
    });

    btnViewTable.addEventListener('click', () => {
      btnViewTable.classList.add('active');
      btnViewTable.style.color = 'var(--text-primary)';
      btnViewTable.style.background = 'var(--canvas-elevated)';
      
      btnViewChart.classList.remove('active');
      btnViewChart.style.color = 'var(--text-muted)';
      btnViewChart.style.background = 'none';

      if (mileageChartContainer) mileageChartContainer.style.display = 'none';
      if (mileageTableContainer) mileageTableContainer.style.display = 'block';
    });
  }

  // Search input typing filter
  document.getElementById('input-search').addEventListener('input', () => {
    renderCourses(coursesData);
  });

  // Reset advanced search selectors to empty default values to prevent filter locks
  function resetAdvancedSearchFilters() {
    selectedTimeSlots.clear();
    const btnLabel = document.getElementById('time-filter-btn-label');
    if (btnLabel) btnLabel.textContent = "시간선택";
    const btnOpenTime = document.getElementById('btn-open-time-filter');
    if (btnOpenTime) {
      btnOpenTime.style.borderColor = 'var(--border-color)';
      btnOpenTime.style.color = 'var(--text-primary)';
    }

    // Reset custom multiselect checkboxes to all checked (default)
    const grid = document.querySelector('#classification-popover .checkbox-grid');
    if (grid) {
      const cbs = grid.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => cb.checked = true);
    }
    selectedClassifications = [...YONSEI_CLASSIFICATIONS];
    const labelSpan = document.querySelector('#btn-classification-trigger .trigger-label');
    if (labelSpan) labelSpan.textContent = "전체";

    // Reset credits multiselect checkboxes to all checked (default)
    const credGrid = document.querySelector('#credits-popover .checkbox-grid');
    if (credGrid) {
      const cbs = credGrid.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => cb.checked = true);
    }
    selectedCredits = CREDIT_OPTIONS.map(opt => opt.value);
    const credLabelSpan = document.querySelector('#btn-credits-trigger .trigger-label');
    if (credLabelSpan) credLabelSpan.textContent = "전체";

    // Reset grade multiselect checkboxes to all checked (default)
    const gradeGrid = document.querySelector('#grade-popover .checkbox-grid');
    if (gradeGrid) {
      const cbs = gradeGrid.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => cb.checked = true);
    }
    selectedGrades = GRADE_OPTIONS.map(opt => opt.value);
    const gradeLabelSpan = document.querySelector('#btn-grade-trigger .trigger-label');
    if (gradeLabelSpan) gradeLabelSpan.textContent = "전체";

    // Reset evaluation multiselect checkboxes to all checked (default)
    const evalGrid = document.querySelector('#evaluation-popover .checkbox-grid');
    if (evalGrid) {
      const cbs = evalGrid.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => cb.checked = true);
    }
    selectedEvals = EVAL_OPTIONS.map(opt => opt.value);
    const evalLabelSpan = document.querySelector('#btn-evaluation-trigger .trigger-label');
    if (evalLabelSpan) evalLabelSpan.textContent = "전체";

    // Reset room multiselect checkboxes to all checked (default)
    const roomGrid = document.querySelector('#room-popover .checkbox-grid');
    if (roomGrid) {
      const cbs = roomGrid.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => cb.checked = true);
    }
    selectedClassrooms = CLASSROOM_OPTIONS.map(opt => opt.value);
    const roomLabelSpan = document.querySelector('#btn-room-trigger .trigger-label');
    if (roomLabelSpan) roomLabelSpan.textContent = "전체";
  }

  // College / Dept / Campus dropdowns change
  document.getElementById('select-college').addEventListener('change', (e) => {
    resetAdvancedSearchFilters();
    loadDepartments(e.target.value);
  });

  document.getElementById('select-dept').addEventListener('change', () => {
    resetAdvancedSearchFilters();
    fetchCourses();
  });
  
  document.getElementById('select-campus').addEventListener('change', () => {
    resetAdvancedSearchFilters();
    fetchCourses();
  });

  // Profile Edit Modal Toggle
  const profileModal = document.getElementById('profile-modal');

  document.getElementById('btn-edit-profile').addEventListener('click', () => {
    // Fill form values with state
    document.getElementById('profile-first-major').value = myProfile.firstMajor;
    document.getElementById('profile-second-major').value = myProfile.secondMajor;
    document.getElementById('profile-grade').value = myProfile.grade;
    document.getElementById('profile-courses').value = myProfile.coursesCount;
    document.getElementById('profile-grad').value = myProfile.gradApp;
    document.getElementById('profile-first').value = myProfile.firstTime;
    document.getElementById('profile-earned-credits').value = myProfile.earnedCredits;
    document.getElementById('profile-req-credits').value = myProfile.reqCredits;
    document.getElementById('profile-last-credits').value = myProfile.lastCredits;
    document.getElementById('profile-max-credits').value = myProfile.maxCredits;
    // 7-stage fields
    document.getElementById('profile-applied-credits').value = myProfile.applied_credits || 18;
    document.getElementById('profile-enrolled-semesters').value = myProfile.enrolled_semesters || 5;
    document.getElementById('profile-max-mileage-budget').value = myProfile.maxTotalMileage || (myProfile.firstMajor === 'stats' ? 72 : 76);
    
    profileModal.classList.add('active');
  });

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    profileModal.classList.remove('active');
  });

  // Profile form submission
  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    myProfile.firstMajor = document.getElementById('profile-first-major').value;
    myProfile.secondMajor = document.getElementById('profile-second-major').value;
    myProfile.grade = document.getElementById('profile-grade').value;
    myProfile.coursesCount = parseInt(document.getElementById('profile-courses').value) || 6;
    myProfile.gradApp = document.getElementById('profile-grad').value;
    myProfile.firstTime = document.getElementById('profile-first').value;
    myProfile.earnedCredits = parseInt(document.getElementById('profile-earned-credits').value) || 95;
    myProfile.reqCredits = parseInt(document.getElementById('profile-req-credits').value) || 130;
    myProfile.lastCredits = parseInt(document.getElementById('profile-last-credits').value) || 18;
    myProfile.maxCredits = parseInt(document.getElementById('profile-max-credits').value) || 18;
    // 7-stage fields
    myProfile.applied_credits = parseInt(document.getElementById('profile-applied-credits').value) || 18;
    myProfile.enrolled_semesters = parseInt(document.getElementById('profile-enrolled-semesters').value) || 5;
    myProfile.maxTotalMileage = parseInt(document.getElementById('profile-max-mileage-budget').value) || 76;
    myProfile.is_graduating = (myProfile.gradApp === 'Y');

    saveDataToStorage();
    renderProfileSummary();
    profileModal.classList.remove('active');
  });


  // Mileage Analysis Modal close handler
  document.getElementById('btn-close-mileage-modal').addEventListener('click', () => {
    document.getElementById('mileage-modal').classList.remove('active');
  });

  // Mileage analysis slider handler
  document.getElementById('predict-score-slider').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('predict-score-label').textContent = val;
    calculateMileagePrediction(val);
    if (activeCourseObject) {
      renderAIProbabilityChart(activeCourseObject, val);
    }
  });

  // Auto Allocate button click handler
  document.getElementById('btn-auto-allocate').addEventListener('click', autoAllocateMileage);

  // Constraint sliders input event handlers
  const inputCred = document.getElementById('input-target-credits');
  if (inputCred) {
    inputCred.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const label = document.getElementById('target-credits-label');
      if (label) label.textContent = `${val}학점`;
      myProfile.targetCredits = val;
      saveDataToStorage();
    });
  }

  const inputProb = document.getElementById('input-target-prob');
  if (inputProb) {
    inputProb.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const label = document.getElementById('target-prob-label');
      if (label) label.textContent = `${val}%`;
      myProfile.targetProb = val / 100.0;
      saveDataToStorage();
    });
  }

  // Monte Carlo Manual Run button click handler
  const btnMonte = document.getElementById('btn-run-monte-carlo');
  if (btnMonte) {
    btnMonte.addEventListener('click', () => {
      const text = document.getElementById('text-monte-carlo');
      const icon = document.getElementById('icon-monte-carlo');
      
      // Update button state to loading
      btnMonte.disabled = true;
      btnMonte.style.pointerEvents = 'none';
      if (text) text.textContent = '🎲 난수 벡터 10,000 Runs 연산 중...';
      if (icon) {
        icon.setAttribute('data-lucide', 'loader-2');
        icon.classList.add('spin');
        if (window.lucide) window.lucide.createIcons();
      }

      // Simulate heavy simulation delay (350ms) for high-end realistic UI feel
      setTimeout(() => {
        runMonteCarloRiskSimulation();
        
        // Restore button state
        btnMonte.disabled = false;
        btnMonte.style.pointerEvents = 'auto';
        btnMonte.style.background = 'linear-gradient(135deg, var(--accent-light), #00aaff)';
        if (text) text.textContent = '✅ 시뮬레이션 완료 (재실행 가능)';
        if (icon) {
          icon.setAttribute('data-lucide', 'play');
          icon.classList.remove('spin');
          if (window.lucide) window.lucide.createIcons();
        }

        // Reveal the risk card content
        const content = document.getElementById('risk-dashboard-content');
        if (content) {
          content.style.filter = 'none';
          content.style.opacity = '1.0';
          content.style.pointerEvents = 'auto';
        }
      }, 350);
    });
  }








  // ── Tab Switcher Event Binding ───────────────────────────────────────────
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // ── Theme Switcher Event Binding ─────────────────────────────────────────
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', targetTheme);
      localStorage.setItem('ymu_theme', targetTheme);
      
      // Update toggle button icon (Show Sun when theme is dark, Moon when theme is light)
      const icon = document.getElementById('theme-icon');
      if (icon) {
        icon.setAttribute('data-lucide', targetTheme === 'dark' ? 'sun' : 'moon');
        if (window.lucide) window.lucide.createIcons();
      }

      // Dynamic rebuild calendar grid block colors instantly
      renderTimetableGrid();
    });
  }

  // ── Syllabus Modal Close Event Binding ──────────────────────────────────
  const syllabusModal = document.getElementById('syllabus-modal');
  const btnCloseSyllable = document.getElementById('btn-close-syllabus-modal');
  if (btnCloseSyllable && syllabusModal) {
    btnCloseSyllable.addEventListener('click', () => {
      syllabusModal.classList.remove('active');
      const iframe = document.getElementById('syllabus-iframe');
      if (iframe) iframe.src = 'about:blank';
    });

    syllabusModal.addEventListener('click', (e) => {
      if (e.target === syllabusModal) {
        syllabusModal.classList.remove('active');
        const iframe = document.getElementById('syllabus-iframe');
        if (iframe) iframe.src = 'about:blank';
      }
    });
  }

  // ── Course Action Modal Close Event Binding ──────────────────────────────
  const actionModal = document.getElementById('course-action-modal');
  const btnCloseAction = document.getElementById('btn-close-action-modal');
  if (btnCloseAction && actionModal) {
    btnCloseAction.addEventListener('click', () => {
      actionModal.classList.remove('active');
    });

    actionModal.addEventListener('click', (e) => {
      if (e.target === actionModal) {
        actionModal.classList.remove('active');
      }
    });
  }
}

// Global Tab switcher utility
function switchTab(tabId) {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    }
  });

  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
    if (content.id === tabId) {
      content.classList.add('active');
      content.style.display = 'block';
    }
  });

  // ── Dynamic relocation of search filters container ────────────────
  const filtersContainer = document.getElementById('search-filters-container');
  const sidebarFiltersPlaceholder = document.getElementById('sidebar-filters-placeholder');
  const tabFiltersPlaceholder = document.getElementById('tab-filters-placeholder');

  if (filtersContainer) {
    if (tabId === 'tab-search') {
      if (tabFiltersPlaceholder) {
        tabFiltersPlaceholder.appendChild(filtersContainer);
      }
    } else {
      if (sidebarFiltersPlaceholder) {
        sidebarFiltersPlaceholder.appendChild(filtersContainer);
      }
    }
  }

  // ── Dynamic relocation of shared search results container ────────────────
  const sharedResults = document.getElementById('shared-search-results');
  const sidebarPlaceholder = document.getElementById('sidebar-search-results-placeholder');
  const tabPlaceholder = document.getElementById('tab-search-results-placeholder');
  
  if (sharedResults) {
    if (tabId === 'tab-search') {
      if (tabPlaceholder) {
        tabPlaceholder.appendChild(sharedResults);
        sharedResults.style.display = 'flex';
        // Hide sidebar results container area
        if (sidebarPlaceholder) sidebarPlaceholder.style.display = 'none';
      }
    } else if (tabId === 'tab-timetable') {
      if (sidebarPlaceholder) {
        sidebarPlaceholder.appendChild(sharedResults);
        sidebarPlaceholder.style.display = 'flex';
        sharedResults.style.display = 'flex';
      }
    } else {
      // Hide search results in mileage tab to keep sidebar clean
      sharedResults.style.display = 'none';
      if (sidebarPlaceholder) sidebarPlaceholder.style.display = 'none';
    }
  }

  // ── Sidebar search-card vs mini-timetable-card switching ────────────────
  const searchCard = document.querySelector('.search-card');
  const miniTimetableCard = document.getElementById('mini-timetable-card');
  
  if (tabId === 'tab-mileage') {
    if (searchCard) searchCard.style.display = 'none';
    if (miniTimetableCard) {
      miniTimetableCard.style.display = 'flex';
      renderMiniTimetableGrid();
    }
  } else if (tabId === 'tab-search') {
    // Hide search card in sidebar because filters are relocated inside the tab!
    if (searchCard) searchCard.style.display = 'none';
    // Show mini timetable in sidebar so they can see live updates while searching!
    if (miniTimetableCard) {
      miniTimetableCard.style.display = 'flex';
      renderMiniTimetableGrid();
    }
  } else {
    // Timetable tab: show search card in sidebar
    if (searchCard) searchCard.style.display = 'flex';
    if (miniTimetableCard) miniTimetableCard.style.display = 'none';
  }

  // Trigger re-render to accommodate layout change sizing & Lucide icons rendering
  if (typeof coursesData !== 'undefined' && coursesData && coursesData.length > 0) {
    renderCourses(coursesData);
  }

  console.log(`[Tab Switched] Active: ${tabId}`);
}

// Render the sidebar Profile Summary information
// 7단계 동점자 처리 우선순위 점수 계산 함수 (sigmoid 보정용)
function computePrivilegeScore(profile, courseCode) {
  let score = 0;
  
  // NOTE: 전공 여부(Major) 및 학년(Year)은 하드 정원 할당(Quota Partition)이므로 
  // calculateGroupSpecificCutoff에서 이미 컷오프 자체를 다르게 산출하여 완벽히 분리 처리됩니다.
  // 따라서 곡선 확률을 보정하는 이 특권 점수(Tie-breaker)에서는 이중 계산을 막기 위해 제외합니다.

  // 순수 동점자 우선순위 (Tie-breakers) - 총점 1.0에 맞게 스케일링
  
  // 1단계: 신청 학점수 (단조 증가, 24학점 기준 정규화) - 가장 영향력 큼 (40%)
  const appliedCredits = profile.applied_credits || 18;
  score += 0.40 * Math.min(appliedCredits / 24, 1.0);
  
  // 2단계: 졸업예정자 여부 (25%)
  if (profile.is_graduating || profile.gradApp === 'Y') score += 0.25;
  
  // 3단계: 초수강 여부 (20%)
  if (profile.firstTime === 'Y') score += 0.20;
  
  // 4단계: 기이수학점 비율 (취득학점 / 졸업요구학점) (10%)
  const earned = profile.earnedCredits || 95;
  const req = profile.reqCredits || 130;
  score += 0.10 * Math.min(earned / req, 1.0);
  
  // 5단계: 재학학기 비율 (재학학기 / 졸업요구학기[8학기]) (5%)
  const semesters = profile.enrolled_semesters || 5;
  score += 0.05 * Math.min(semesters / 8, 1.0);
  
  return score;
}

function renderProfileSummary() {
  const items = document.querySelectorAll('.profile-summary .profile-item .item-value');
  if (items.length >= 3) {
    const firstText = myProfile.firstMajor === 'math' ? '수학전공' : 
                      myProfile.firstMajor === 'stats' ? '응용통계학전공' : '기타전공';
    const secondText = myProfile.secondMajor === 'none' ? '' : 
                       myProfile.secondMajor === 'math' ? ' + 수학(복)' : 
                       myProfile.secondMajor === 'stats' ? ' + 응용통계(복)' : ' + 기타(복)';
    items[0].textContent = `${firstText}${secondText}`;
    
    // 7단계 우선순위 점수 간략 표기 추가
    const sampleScore = computePrivilegeScore(myProfile, 'MAT0000');
    items[1].textContent = `${myProfile.coursesCount}과목 (${myProfile.applied_credits}학점)`;
    items[2].textContent = `${myProfile.earnedCredits} / ${myProfile.reqCredits}학점 (${Math.round((myProfile.earnedCredits / myProfile.reqCredits) * 100)}%)`;
    
    // 사이드바 하단에 동점자 우선순위 점수 배지 동적 업데이트
    let scoreBadge = document.getElementById('sidebar-privilege-badge');
    if (!scoreBadge) {
      const summaryCard = document.querySelector('.profile-summary');
      if (summaryCard) {
        scoreBadge = document.createElement('div');
        scoreBadge.id = 'sidebar-privilege-badge';
        scoreBadge.style.cssText = 'margin-top: 12px; padding: 8px 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 6px; font-size: 11.5px; color: var(--accent-light); display: flex; justify-content: space-between; align-items: center;';
        summaryCard.appendChild(scoreBadge);
      }
    }
    if (scoreBadge) {
      scoreBadge.innerHTML = `
        <span>동점자 우선 점수:</span>
        <strong>${sampleScore.toFixed(3)} / 1.10점</strong>
      `;
    }
  }
}


// Sync dynamically computed profile metrics (coursesCount, applied_credits) with selectedCourses in timetable
function syncProfileWithTimetable() {
  myProfile.coursesCount = selectedCourses.length > 0 ? selectedCourses.length : 6;
  myProfile.applied_credits = selectedCourses.length > 0 
    ? selectedCourses.reduce((sum, c) => sum + (c.credits || 3), 0)
    : 18;
}

// LocalStorage Persistence
function saveDataToStorage() {
  syncProfileWithTimetable();
  localStorage.setItem('yonsei_timetable_selected', JSON.stringify(selectedCourses));
  localStorage.setItem('yonsei_timetable_profile', JSON.stringify(myProfile));
}

function loadDataFromStorage() {
  const selected = localStorage.getItem('yonsei_timetable_selected');
  const profile = localStorage.getItem('yonsei_timetable_profile');

  if (selected) {
    selectedCourses = JSON.parse(selected);
    
    // Sync-clamp values using precomputed curves before rendering to recover from stale states
    selectedCourses.forEach(c => {
      const key = `${c.code}-${c.division}`;
      let maxVal = 36;
      if (c.mileageSummary && c.mileageSummary.max_allowed_mileage) {
        maxVal = c.mileageSummary.max_allowed_mileage;
      } else if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key]) {
        maxVal = precomputedCurves.curves[key].max_allowed || 36;
      }
      if (c.mileage > maxVal) {
        console.log(`[Storage Load Clamping] Clamped ${c.code}-${c.division} from ${c.mileage} to ${maxVal}`);
        c.mileage = maxVal;
      }
    });

    renderTimetableGrid();
    renderSelectedCoursesList();
    
    // Fetch stats for the loaded courses to restore advisor card
    selectedCourses.forEach(c => {
      if (!c.mileageSummary) {
        fetchMileageSummaryForAdvisor(c);
      }
    });
  }
  if (profile) {
    myProfile = JSON.parse(profile);
    // Ensure new 7-stage fields are initialized even if loading older profiles
    if (myProfile.maxTotalMileage === undefined) {
      myProfile.maxTotalMileage = myProfile.firstMajor === 'stats' ? 72 : 76;
    }
    if (myProfile.applied_credits === undefined) myProfile.applied_credits = 18;
    if (myProfile.enrolled_semesters === undefined) myProfile.enrolled_semesters = 5;
    if (myProfile.is_graduating === undefined) myProfile.is_graduating = (myProfile.gradApp === 'Y');
    if (myProfile.targetCredits === undefined) myProfile.targetCredits = 9;
    if (myProfile.targetProb === undefined) myProfile.targetProb = 0.85;

    // Sync sliders UI
    const targetCredInput = document.getElementById('input-target-credits');
    const targetCredLabel = document.getElementById('target-credits-label');
    if (targetCredInput && targetCredLabel) {
      targetCredInput.value = myProfile.targetCredits;
      targetCredLabel.textContent = `${myProfile.targetCredits}학점`;
    }

    const targetProbInput = document.getElementById('input-target-prob');
    const targetProbLabel = document.getElementById('target-prob-label');
    if (targetProbInput && targetProbLabel) {
      targetProbInput.value = Math.round(myProfile.targetProb * 100);
      targetProbLabel.textContent = `${Math.round(myProfile.targetProb * 100)}%`;
    }

    syncProfileWithTimetable();
    renderProfileSummary();
  }
}

// Filter out voluntary drop outliers from bids array (preserving major-protection competitive groups)
function filterCleanBids(bids) {
  if (!bids || bids.length === 0) return [];
  
  // Group bids by their exact major status to avoid cross-group rank contamination (due to major protection)
  const groups = {};
  bids.forEach(b => {
    const key = b.major || 'N(N)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  const cleanedBids = [];
  
  Object.keys(groups).forEach(key => {
    const groupBids = groups[key];
    const successRanks = groupBids.filter(b => b.success === 'Y' && b.rank !== null && b.rank > 0).map(b => b.rank);
    
    if (successRanks.length === 0) {
      // If no successful bids in this major group, all bids are kept
      cleanedBids.push(...groupBids);
    } else {
      const maxSuccessRank = Math.max(...successRanks);
      groupBids.forEach(b => {
        // Exclude failed bids that had rank less than the maximum successful rank in their own group
        if (b.success !== 'Y' && b.rank !== null && b.rank > 0 && b.rank < maxSuccessRank) {
          // Outlier (withdrawn/deleted)
          return;
        }
        cleanedBids.push(b);
      });
    }
  });

  // Re-sort the final merged bids by their rank ascending
  return cleanedBids.sort((a, b) => {
    const rA = a.rank || 9999;
    const rB = b.rank || 9999;
    return rA - rB;
  });
}

// Active mileage stats data cache
let activeMileageData = null;

// Open mileage analysis modal and populate data
async function openMileageAnalysisModal(course) {
  // Local helper to calculate percentile values (q10, q50, q90)
  function calculatePercentileValue(mileages, percentile) {
    if (!mileages || mileages.length === 0) return 'N/A';
    const sorted = [...mileages].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const low = Math.floor(index);
    const high = Math.ceil(index);
    if (low === high) return sorted[low].toFixed(1);
    return (sorted[low] + (sorted[high] - sorted[low]) * (index - low)).toFixed(1);
  }

  activeCourseCode = course.code; // Store the active course code globally
  activeCourseObject = course;    // Store the full active course object globally
  const modal = document.getElementById('mileage-modal');
  const title = document.getElementById('mileage-modal-title');
  
  // Global DOM selectors
  const globalRatioLabel = document.getElementById('global-ratio');
  const globalCutlineLabel = document.getElementById('global-cutline');
  const globalAvgLabel = document.getElementById('global-avg');

  // Year DOM selectors
  const yearStatsTitle = document.getElementById('year-stats-title');
  const yearRatioLabel = document.getElementById('year-ratio');
  const yearCutlineLabel = document.getElementById('year-cutline');
  const yearAvgLabel = document.getElementById('year-avg');

  const majorCutLabel = document.getElementById('major-cut');
  const majorAvgLabel = document.getElementById('major-avg');
  const nonmajorCutLabel = document.getElementById('nonmajor-cut');
  const nonmajorAvgLabel = document.getElementById('nonmajor-avg');
  
  // Constraints card DOM selectors
  const detailYearQuotas = document.getElementById('detail-year-quotas');
  const detailMajorQuota = document.getElementById('detail-major-quota');
  const detailMaxMileage = document.getElementById('detail-max-mileage');
  
  const chartContainer = document.getElementById('mileage-chart-container');
  const predictSlider = document.getElementById('predict-score-slider');
  const predictLabel = document.getElementById('predict-score-label');

  // Show modal
  title.textContent = `[${course.code}-${course.division}] ${course.title} 마일리지 분석`;
  modal.classList.add('active');

  // Reset tab button states and active tab content to Tab 1 on open
  document.querySelectorAll('.mileage-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-target') === 'mileage-tab-basic') {
      btn.classList.add('active');
    }
  });
  document.querySelectorAll('.mileage-tab-content').forEach(content => {
    content.classList.remove('active');
    if (content.id === 'mileage-tab-basic') {
      content.classList.add('active');
    }
  });

  // Reset distribution view toggle to Chart on open
  const btnViewChart = document.getElementById('btn-view-chart');
  const btnViewTable = document.getElementById('btn-view-table');
  const mileageChartContainer = document.getElementById('mileage-chart-container');
  const mileageTableContainer = document.getElementById('mileage-table-container');
  if (btnViewChart && btnViewTable) {
    btnViewChart.classList.add('active');
    btnViewChart.style.color = 'var(--text-primary)';
    btnViewChart.style.background = 'var(--canvas-elevated)';
    
    btnViewTable.classList.remove('active');
    btnViewTable.style.color = 'var(--text-muted)';
    btnViewTable.style.background = 'none';

    if (mileageChartContainer) mileageChartContainer.style.display = 'block';
    if (mileageTableContainer) mileageTableContainer.style.display = 'none';
  }

  // 0. Populate sibling divisions comparison table
  const compList = document.getElementById('divisions-comparison-list');
  compList.innerHTML = '';
  
  // Filter coursesData to find all divisions for the current course code
  const siblingDivisions = coursesData.filter(c => c.code === course.code);
  
  siblingDivisions.forEach(sibling => {
    const divItem = document.createElement('div');
    divItem.className = `division-comp-item ${sibling.division === course.division ? 'active' : ''}`;
    divItem.innerHTML = `
      <div class="div-meta">
        <strong style="color:var(--text-primary); font-size:12.5px;">${sibling.division}분반</strong>
        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${sibling.professor || '교수 미지정'} | ${sibling.time}</span>
      </div>
      <div class="div-stats-preview" id="div-preview-${sibling.division}" style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:8px;">
        <span>대조 데이터 로드 중...</span>
      </div>
    `;
    
    // Switch active division inside modal on click
    divItem.addEventListener('click', () => {
      if (sibling.division !== course.division) {
        openMileageAnalysisModal(sibling);
      }
    });
    
    compList.appendChild(divItem);
    
    // Asynchronously fetch stats for this sibling division
    fetchSiblingStats(course.code, sibling.division);
  });

  // Loading state
  chartContainer.innerHTML = `
    <div class="list-placeholder">
      <i data-lucide="loader-2" class="spin"></i>
      <p>마일리지 과거 이력을 가져오는 중...</p>
    </div>
  `;
  lucide.createIcons();

  try {
    const response = await fetch(`/api/mileage?code=${course.code}&division=${course.division}`);
    const resData = await response.json();

    if (!resData.success) {
      chartContainer.innerHTML = `
        <div class="list-placeholder">
          <i data-lucide="alert-triangle" style="color: var(--danger)"></i>
          <p>분석 데이터 로딩 실패: ${resData.error}</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    activeMileageData = resData.data;
    const summary = activeMileageData.summary;
    const bids = filterCleanBids(activeMileageData.bids);

    // 0.5 Update AI Prediction card if curves are precomputed
    const aiCard = document.getElementById('ai-prediction-card');
    const aiQ10 = document.getElementById('ai-q10');
    const aiQ50 = document.getElementById('ai-q50');
    const aiQ90 = document.getElementById('ai-q90');
    const lookupKey = `${course.code}-${course.division}`;

    if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[lookupKey]) {
      const pred = precomputedCurves.curves[lookupKey];
      const userMajor = determineMajorStatus(course.code, myProfile);
      const isMajor = userMajor !== 'N(N)';
      const groupPred = isMajor ? pred.major : pred.non_major;
      const userGrade = myProfile.grade || 4;
      const gradePred = groupPred[`grade_${userGrade}`] || groupPred.grade_4 || groupPred;
      aiQ10.textContent = `${gradePred.q10.toFixed(1)}점`;
      aiQ50.textContent = `${gradePred.median.toFixed(1)}점`;
      aiQ90.textContent = `${gradePred.q90.toFixed(1)}점`;
      aiCard.style.display = 'block';
    } else {
      aiCard.style.display = 'none';
    }

    // 1. Populate Global stats

    const globalCompRatio = (summary.applicants / summary.capacity).toFixed(2);
    globalRatioLabel.innerHTML = `${summary.applicants} / ${summary.capacity} <small>(${globalCompRatio}:1)</small>`;
    
    // Find general cutline (excluding special remarks like '*' exchange/disabled)
    const generalPassBids = bids.filter(b => b.success === 'Y' && !b.remark);
    const globalCutlineVal = generalPassBids.length > 0 ? Math.min(...generalPassBids.map(b => b.mileage)) : summary.min_mileage;
    globalCutlineLabel.textContent = `${globalCutlineVal}점`;
    
    const globalPassBidsAll = bids.filter(b => b.success === 'Y');
    const globalAvgVal = globalPassBidsAll.length > 0 ? (globalPassBidsAll.reduce((sum, b) => sum + b.mileage, 0) / globalPassBidsAll.length).toFixed(2) : '0';
    globalAvgLabel.textContent = `${globalAvgVal}점`;

    // Global Percentiles (q10, q50, q90)
    const globalPassMileages = globalPassBidsAll.map(b => b.mileage);
    const g10 = calculatePercentileValue(globalPassMileages, 10);
    const g50 = calculatePercentileValue(globalPassMileages, 50);
    const g90 = calculatePercentileValue(globalPassMileages, 90);
    const globalPercentilesEl = document.getElementById('global-percentiles');
    if (globalPercentilesEl) {
      globalPercentilesEl.textContent = g10 !== 'N/A' ? `${g10} / ${g50} / ${g90}점` : 'N/A';
    }

    // 2. Populate Custom Group Stats based on User Situation (Grade & Major Status)
    const userGrade = myProfile.grade;
    const userMajorStatus = determineMajorStatus(course.code, myProfile);
    const isMajor = userMajorStatus !== 'N(N)';
    const userMajorLabel = userMajorStatus === 'Y(Y)' ? '본전공자' : (userMajorStatus === 'Y(N)' ? '복수전공자' : '비전공자');
    const mySituationLabel = `${userGrade}학년 / ${userMajorLabel}`;

    const yq = summary.year_quotas;
    const isYearQuotasActive = yq && (yq['1'] > 0 || yq['2'] > 0 || yq['3'] > 0 || yq['4'] > 0);
    const yearCapacity = isYearQuotasActive ? (yq[userGrade] || 0) : summary.capacity;

    const majorQuotaMatch = summary.major_ratio ? summary.major_ratio.match(/^(\d+)(?:\((.+)\))?/) : null;
    const isMajorQuotaActive = majorQuotaMatch && parseInt(majorQuotaMatch[1]) > 0;
    const mqVal = isMajorQuotaActive ? parseInt(majorQuotaMatch[1]) : 0;
    const includesDoubleMajor = majorQuotaMatch && majorQuotaMatch[2] === 'Y';

    // Helper to determine if a bid is protected under the major quota
    const isBidProtected = (b) => {
      return b.major.startsWith('Y(Y)') || (includesDoubleMajor && b.major.startsWith('Y(N)'));
    };

    // Determine if the user belongs to the protected major group
    let userBelongsToProtectedGroup = false;
    if (userMajorStatus === 'Y(Y)') {
      userBelongsToProtectedGroup = true;
    } else if (userMajorStatus === 'Y(N)') {
      userBelongsToProtectedGroup = includesDoubleMajor;
    } else {
      userBelongsToProtectedGroup = false;
    }

    // Filter bids belonging to the user's specific group
    let groupBids = bids;
    let groupCapacityLabel = "정원";
    let groupCapacityVal = summary.capacity;

    if (isYearQuotasActive && isMajorQuotaActive) {
      groupBids = bids.filter(b => {
        const inGrade = b.grade === userGrade;
        if (!inGrade) return false;
        const protectedBid = isBidProtected(b);
        return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
      });
      groupCapacityLabel = `${userGrade}학년 정원`;
      groupCapacityVal = yearCapacity;
    } else if (isYearQuotasActive) {
      groupBids = bids.filter(b => b.grade === userGrade);
      groupCapacityLabel = `${userGrade}학년 정원`;
      groupCapacityVal = yearCapacity;
    } else if (isMajorQuotaActive) {
      groupBids = bids.filter(b => {
        const protectedBid = isBidProtected(b);
        return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
      });
      if (userBelongsToProtectedGroup) {
        groupCapacityLabel = "전공자 정원";
        groupCapacityVal = mqVal;
      } else {
        groupCapacityLabel = "비전공자 정원";
        groupCapacityVal = Math.max(0, summary.capacity - mqVal);
      }
    } else {
      groupBids = bids;
      groupCapacityLabel = "전체 정원";
      groupCapacityVal = summary.capacity;
    }

    const groupApplicants = groupBids.length;
    const groupCompRatio = groupCapacityVal > 0 ? (groupApplicants / groupCapacityVal).toFixed(2) : '0';
    yearRatioLabel.innerHTML = `${groupApplicants} / ${groupCapacityVal} <small>(${groupCompRatio}:1)</small>`;

    const groupPassBids = groupBids.filter(b => b.success === 'Y' && !b.remark);
    const groupCutlineVal = groupPassBids.length > 0 ? Math.min(...groupPassBids.map(b => b.mileage)) : 'N/A';
    yearCutlineLabel.textContent = groupCutlineVal !== 'N/A' ? `${groupCutlineVal}점` : 'N/A';

    const groupAvgVal = groupPassBids.length > 0 ? (groupPassBids.reduce((sum, b) => sum + b.mileage, 0) / groupPassBids.length).toFixed(2) : 'N/A';
    yearAvgLabel.textContent = groupAvgVal !== 'N/A' ? `${groupAvgVal}점` : 'N/A';

    // Group Percentiles (q10, q50, q90)
    const groupPassMileages = groupPassBids.map(b => b.mileage);
    const gr10 = calculatePercentileValue(groupPassMileages, 10);
    const gr50 = calculatePercentileValue(groupPassMileages, 50);
    const gr90 = calculatePercentileValue(groupPassMileages, 90);
    const yearPercentilesEl = document.getElementById('year-percentiles');
    if (yearPercentilesEl) {
      yearPercentilesEl.textContent = gr10 !== 'N/A' ? `${gr10} / ${gr50} / ${gr90}점` : 'N/A';
    }

    // Toggle Grade Quota Section Display
    const yearGrid = document.getElementById('year-stats-grid');
    const yearNotice = document.getElementById('year-stats-notice');

    // Update labels via IDs for safety
    const yearRatioLabelEl = document.getElementById('year-ratio-label');
    const yearCutlineLabelEl = document.getElementById('year-cutline-label');
    const yearAvgLabelEl = document.getElementById('year-avg-label');
    const yearPercentilesLabelEl = document.getElementById('year-percentiles-label');

    if (yearRatioLabelEl) yearRatioLabelEl.textContent = `${groupCapacityLabel} 대비 신청자`;
    if (yearCutlineLabelEl) yearCutlineLabelEl.textContent = "그룹 합격 커트라인";
    if (yearAvgLabelEl) yearAvgLabelEl.textContent = "그룹 합격자 평균";
    if (yearPercentilesLabelEl) yearPercentilesLabelEl.textContent = "그룹 분위수 (q10/q50/q90)";

    let noticeMessage = "";
    let showGrid = true;

    if (isYearQuotasActive && isMajorQuotaActive) {
      noticeMessage = `이 과목은 <strong>학년별 정원</strong>과 <strong>전공자 보호제한</strong>이 모두 적용됩니다. 귀하는 <strong>'${userGrade}학년 / ${userMajorLabel}'</strong> 그룹에서 경쟁합니다.`;
    } else if (isYearQuotasActive) {
      noticeMessage = `이 과목은 <strong>학년별 정원 제한</strong>이 적용됩니다. 귀하는 <strong>'${userGrade}학년'</strong> 그룹에서 경쟁하며, 전공 여부 차별은 없습니다.`;
    } else if (isMajorQuotaActive) {
      noticeMessage = `이 과목은 <strong>전공자 보호제한</strong>이 적용됩니다. 귀하는 <strong>'${userMajorLabel}'</strong> 그룹에서 경쟁하며, 학년 구분은 없습니다.`;
    } else {
      noticeMessage = `이 과목은 학년별 정원 및 전공자 보호제한이 없습니다. 모든 학년/전공 구분 없이 전체 정원을 두고 공동 경쟁합니다.`;
      showGrid = false;
    }

    yearStatsTitle.textContent = `나의 맞춤형 지원 현황 (${mySituationLabel})`;

    if (showGrid) {
      if (yearGrid) yearGrid.style.display = 'grid';
      if (yearNotice) {
        yearNotice.style.display = 'flex';
        yearNotice.innerHTML = `<i data-lucide="info" style="width: 14.5px; height: 14.5px; color: var(--accent-light); flex-shrink: 0;"></i><span>${noticeMessage}</span>`;
      }
    } else {
      if (yearGrid) yearGrid.style.display = 'none';
      if (yearNotice) {
        yearNotice.style.display = 'flex';
        yearNotice.innerHTML = `<i data-lucide="info" style="width: 14.5px; height: 14.5px; color: var(--accent-light); flex-shrink: 0;"></i><span>${noticeMessage}</span>`;
      }
    }
    lucide.createIcons();

    // 3. Dynamic Sub-group Stats Cards (Grade x Major)
    const majorRow = document.getElementById('major-stats-row');
    const majorNotice = document.getElementById('major-stats-notice');
    
    if (majorRow) {
      majorRow.innerHTML = '';
      
      let cardsData = [];

      if (isYearQuotasActive && isMajorQuotaActive) {
        // Case A: Both active (6 groups: Grades 2, 3, 4 x Major, Non-major)
        const activeGrades = ['2', '3', '4'];
        activeGrades.forEach(g => {
          // Major Group for Grade g (Protected)
          const mPass = bids.filter(b => b.grade === g && isBidProtected(b) && b.success === 'Y');
          const mCut = mPass.length > 0 ? Math.min(...mPass.map(b => b.mileage)) : 'N/A';
          const mAvg = mPass.length > 0 ? (mPass.reduce((sum, b) => sum + b.mileage, 0) / mPass.length).toFixed(1) : 'N/A';
          cardsData.push({ title: `${g}학년 본전공자`, cut: mCut, avg: mAvg, isMajor: true });

          // Non-major Group for Grade g (Unprotected)
          const nmPass = bids.filter(b => b.grade === g && !isBidProtected(b) && b.success === 'Y');
          const nmCut = nmPass.length > 0 ? Math.min(...nmPass.map(b => b.mileage)) : 'N/A';
          const nmAvg = nmPass.length > 0 ? (nmPass.reduce((sum, b) => sum + b.mileage, 0) / nmPass.length).toFixed(1) : 'N/A';
          cardsData.push({ title: `${g}학년 비전공자`, cut: nmCut, avg: nmAvg, isMajor: false });
        });
      } else if (isYearQuotasActive) {
        // Case B: Grade Quotas only (Grades 1, 2, 3, 4 depending on yq)
        const grades = ['1', '2', '3', '4'];
        grades.forEach(g => {
          if (yq && yq[g] > 0) {
            const gPass = bids.filter(b => b.grade === g && b.success === 'Y');
            const gCut = gPass.length > 0 ? Math.min(...gPass.map(b => b.mileage)) : 'N/A';
            const gAvg = gPass.length > 0 ? (gPass.reduce((sum, b) => sum + b.mileage, 0) / gPass.length).toFixed(1) : 'N/A';
            cardsData.push({ title: `${g}학년 전체`, cut: gCut, avg: gAvg, isMajor: true });
          }
        });
      } else if (isMajorQuotaActive) {
        // Case C: Major Protection only (2 groups: Major, Non-major)
        const mPass = bids.filter(b => isBidProtected(b) && b.success === 'Y');
        const mCut = mPass.length > 0 ? Math.min(...mPass.map(b => b.mileage)) : 'N/A';
        const mAvg = mPass.length > 0 ? (mPass.reduce((sum, b) => sum + b.mileage, 0) / mPass.length).toFixed(1) : 'N/A';
        cardsData.push({ title: '본전공자 합격 기준', cut: mCut, avg: mAvg, isMajor: true });

        const nmPass = bids.filter(b => !isBidProtected(b) && b.success === 'Y');
        const nmCut = nmPass.length > 0 ? Math.min(...nmPass.map(b => b.mileage)) : 'N/A';
        const nmAvg = nmPass.length > 0 ? (nmPass.reduce((sum, b) => sum + b.mileage, 0) / nmPass.length).toFixed(1) : 'N/A';
        cardsData.push({ title: '비전공자 합격 기준', cut: nmCut, avg: nmAvg, isMajor: false });
      }

      if (cardsData.length > 0) {
        majorRow.style.display = 'grid';
        if (majorNotice) majorNotice.style.display = 'none';
        
        cardsData.forEach(card => {
          const cardDiv = document.createElement('div');
          cardDiv.className = 'quota-box';
          cardDiv.style.borderLeft = card.isMajor ? '3px solid var(--accent-light)' : '3px solid var(--warning)';
          cardDiv.innerHTML = `
            <h3 style="font-size:12px; margin-bottom:10px; color:var(--text-primary); font-weight:700; border-left:none; padding-left:0;">${card.title}</h3>
            <div class="quota-stat" style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11.5px;">
              <span class="lbl" style="color:var(--text-muted);">커트라인</span>
              <strong style="color:var(--warning); font-size:12.5px;">${card.cut !== 'N/A' ? card.cut + '점' : 'N/A'}</strong>
            </div>
            <div class="quota-stat" style="display:flex; justify-content:space-between; font-size:11.5px;">
              <span class="lbl" style="color:var(--text-muted);">합격 평균</span>
              <span style="color:var(--text-secondary); font-weight:500;">${card.avg !== 'N/A' ? card.avg + '점' : 'N/A'}</span>
            </div>
          `;
          majorRow.appendChild(cardDiv);
        });
      } else {
        majorRow.style.display = 'none';
        if (majorNotice) {
          majorNotice.style.display = 'flex';
          majorNotice.innerHTML = `
            <i data-lucide="info" style="width: 14.5px; height: 14.5px; color: var(--accent-light); flex-shrink: 0;"></i>
            <span>이 과목은 전공자 보호 및 학년별 배정 제한이 없습니다. 모든 인원이 공동 경쟁합니다.</span>
          `;
          lucide.createIcons();
        }
      }
    }

    // 4. Populate Constraints details
    detailMaxMileage.textContent = `${summary.max_allowed_mileage}점`;

    if (majorQuotaMatch) {
      const mqVal = majorQuotaMatch[1];
      const mqType = majorQuotaMatch[2] === 'Y' ? '본전공/복수전공 모두 적용' : '본전공자만 적용 (복수전공자 제외)';
      detailMajorQuota.textContent = `${mqVal}명 (${mqType})`;
    } else {
      detailMajorQuota.textContent = '제한 없음 (0명)';
    }

    if (yq) {
      const parts = [];
      if (yq['1'] > 0) parts.push(`1학년: ${yq['1']}명`);
      if (yq['2'] > 0) parts.push(`2학년: ${yq['2']}명`);
      if (yq['3'] > 0) parts.push(`3학년: ${yq['3']}명`);
      if (yq['4'] > 0) parts.push(`4학년: ${yq['4']}명`);
      if (yq['5'] > 0) parts.push(`5학년: ${yq['5']}명`);
      if (yq['6'] > 0) parts.push(`6학년: ${yq['6']}명`);
      detailYearQuotas.textContent = parts.length > 0 ? parts.join(' | ') : '학년별 정원 제한 없음';
    } else {
      detailYearQuotas.textContent = '학년별 정원 제한 없음';
    }

    // 2. Set test slider max
    predictSlider.max = summary.max_allowed_mileage;
    // Set default value to either this course's currently allocated mileage, or 12
    const currentAllocated = selectedCourses.find(c => c.code === course.code && c.division === course.division);
    const defaultTestVal = currentAllocated ? currentAllocated.mileage : 12;
    predictSlider.value = defaultTestVal;
    predictLabel.textContent = defaultTestVal;

    // 3. Render Distribution Chart
    renderBidsChart(bids, summary.max_allowed_mileage);

    // 4. Calculate prediction and render AI probability chart
    calculateMileagePrediction(defaultTestVal);
    renderAIProbabilityChart(course, defaultTestVal);

    // 5. Populate Historical Semesters Table
    const historyBody = document.getElementById('history-table-body');
    if (resData.data.history && resData.data.history.length > 0) {
      historyBody.innerHTML = '';
      resData.data.history.forEach(item => {
        const tr = document.createElement('tr');
        
        let semStr = `${item.year}학년도 `;
        if (item.semester === '10') semStr += '1학기';
        else if (item.semester === '20') semStr += '2학기';
        else if (item.semester === '21') semStr += '여름학기';
        else if (item.semester === '22') semStr += '겨울학기';
        else semStr += item.semester;
        
        const ratio = item.capacity > 0 ? (item.applicants / item.capacity).toFixed(2) : '0';
        
        tr.innerHTML = `
          <td style="padding: 8px; font-weight: 600;">${semStr}</td>
          <td style="padding: 8px;">${item.capacity}명</td>
          <td style="padding: 8px;">${item.applicants}명</td>
          <td style="padding: 8px; color: var(--accent-light);">${ratio}:1</td>
          <td style="padding: 8px; color: var(--warning); font-weight: 700;">${item.min_mileage}점</td>
          <td style="padding: 8px;">${item.average_mileage}점</td>
        `;
        historyBody.appendChild(tr);
      });
    } else {
      historyBody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 12px; color: var(--text-muted);">이 과목의 과거 마일리지 선발 기록이 존재하지 않습니다.</td>
        </tr>
      `;
    }

    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    chartContainer.innerHTML = `
      <div class="list-placeholder">
        <i data-lucide="alert-triangle" style="color: var(--danger)"></i>
        <p>네트워크 오류가 발생했습니다.</p>
      </div>
    `;
    lucide.createIcons();
  }
}


// Render AI Probability Curve Chart using Chart.js (gradient line chart with current bid highlight)
function renderAIProbabilityChart(course, currentBid) {
  const ctx = document.getElementById('ai-probability-chart');
  if (!ctx) return;

  const lookupKey = `${course.code}-${course.division}`;
  if (!precomputedCurves || !precomputedCurves.curves || !precomputedCurves.curves[lookupKey]) {
    // Hide the chart container if curves are not computed for this course
    document.querySelector('.ai-chart-container').style.display = 'none';
    return;
  }

  document.querySelector('.ai-chart-container').style.display = 'block';

  // 1. If chart already exists for the same course, update the slider indicator line and the highlight point without recreation (buttery smooth update)
  if (aiChartInstance && aiChartInstance.lookupKey === lookupKey) {
    if (aiChartInstance.options.plugins && aiChartInstance.options.plugins.verticalLine) {
      aiChartInstance.options.plugins.verticalLine.xValue = currentBid;
    }
    
    // Highlight the point for current bid in the line dataset (dataset index 2)
    const probDataset = aiChartInstance.data.datasets[2];
    if (probDataset) {
      const pointRadii = probDataset.pointRadius;
      const pointBgColors = probDataset.pointBackgroundColor;
      const pointBorderColors = probDataset.pointBorderColor;

      pointRadii.fill(0);
      pointBgColors.fill('rgba(0,0,0,0)');
      pointBorderColors.fill('rgba(0,0,0,0)');

      const bidIdx = Math.round(currentBid);
      if (bidIdx >= 0 && bidIdx < pointRadii.length) {
        pointRadii[bidIdx] = 6;
        pointBgColors[bidIdx] = '#0070f3';
        pointBorderColors[bidIdx] = '#ffffff';
      }
    }

    aiChartInstance.update('none');
    return;
  }

  // Destroy previous instance to avoid canvas redraw glitch
  if (aiChartInstance) {
    aiChartInstance.destroy();
    aiChartInstance = null;
  }

  const pred = precomputedCurves.curves[lookupKey];
  const userMajor = determineMajorStatus(course.code, myProfile);
  const isMajor = userMajor !== 'N(N)';
  const groupPred = isMajor ? pred.major : pred.non_major;
  const userGrade = myProfile.grade || 4;
  const gradePred = groupPred[`grade_${userGrade}`] || groupPred.grade_4 || groupPred;
  const maxAllowed = pred.max_allowed || 36;
  const rawCurve = gradePred.prob_curve;

  // Make sure we slice or pad rawCurve according to maxAllowed
  let probCurve = [...rawCurve];
  if (probCurve.length > maxAllowed + 1) {
    probCurve = probCurve.slice(0, maxAllowed + 1);
  } else {
    while (probCurve.length <= maxAllowed) {
      probCurve.push(1.0);
    }
  }

  // Calculate under-enrolled state
  let isGroupUnderEnrolled = false;
  let groupBids = [];
  if (activeMileageData && activeMileageData.summary) {
    const summary = activeMileageData.summary;
    const bids = filterCleanBids(activeMileageData.bids);
    const userGrade = myProfile.grade || 4;
    const userMajorStatus = determineMajorStatus(course.code, myProfile);
    const majorQuotaMatch = summary.major_ratio ? summary.major_ratio.match(/^(\d+)(?:\((.+)\))?/) : null;
    const isMajorQuotaActive = majorQuotaMatch && parseInt(majorQuotaMatch[1]) > 0;
    const mqVal = isMajorQuotaActive ? parseInt(majorQuotaMatch[1]) : 0;
    const includesDoubleMajor = majorQuotaMatch && majorQuotaMatch[2] === 'Y';

    const isBidProtected = (b) => {
      return b.major.startsWith('Y(Y)') || (includesDoubleMajor && b.major.startsWith('Y(N)'));
    };

    let userBelongsToProtectedGroup = false;
    if (userMajorStatus === 'Y(Y)') {
      userBelongsToProtectedGroup = true;
    } else if (userMajorStatus === 'Y(N)') {
      userBelongsToProtectedGroup = includesDoubleMajor;
    } else {
      userBelongsToProtectedGroup = false;
    }

    const yq = summary.year_quotas;
    const isYearQuotasActive = yq && (yq['1'] > 0 || yq['2'] > 0 || yq['3'] > 0 || yq['4'] > 0);
    const yearCapacity = isYearQuotasActive ? (yq[userGrade] || 0) : summary.capacity;

    let groupCapacityVal = summary.capacity;
    groupBids = bids;

    if (isYearQuotasActive && isMajorQuotaActive) {
      groupBids = bids.filter(b => {
        const inGrade = b.grade === userGrade;
        if (!inGrade) return false;
        const protectedBid = isBidProtected(b);
        return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
      });
      groupCapacityVal = yearCapacity;
    } else if (isYearQuotasActive) {
      groupBids = bids.filter(b => b.grade === userGrade);
      groupCapacityVal = yearCapacity;
    } else if (isMajorQuotaActive) {
      groupBids = bids.filter(b => {
        const protectedBid = isBidProtected(b);
        return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
      });
      if (userBelongsToProtectedGroup) {
        groupCapacityVal = mqVal;
      } else {
        groupCapacityVal = Math.max(0, summary.capacity - mqVal);
      }
    }

    if (groupCapacityVal > 0 && groupBids.length <= groupCapacityVal) {
      isGroupUnderEnrolled = true;
    }
  }

  let isUnderEnrolled = isGroupUnderEnrolled || (pred.median <= 1.5);
  const medianVal = calculateGroupSpecificCutoff(course, myProfile);
  
  // Calculate tie-breaker probability at the cutoff dynamically
  let tieBreakerProb = 0.5; // Default fallback
  if (activeMileageData && activeMileageData.bids) {
    const bidsAtCutoff = groupBids.filter(b => b.mileage === medianVal);
    if (bidsAtCutoff.length > 0) {
      const passedAtCutoff = bidsAtCutoff.filter(b => b.success === 'Y');
      tieBreakerProb = passedAtCutoff.length / bidsAtCutoff.length;
    }
  }
  tieBreakerProb = Math.min(0.9, Math.max(0.1, tieBreakerProb));

  const calibratedCurve = [];
  for (let m = 0; m <= maxAllowed; m++) {
    let p = 0.0;
    if (isUnderEnrolled) {
      p = (m >= 1) ? 0.98 : 0.0;
    } else {
      if (m < medianVal) {
        const dist = m - medianVal;
        p = 1 / (1 + Math.exp(-2.0 * dist)); // Smooth logistic curve centered at medianVal
        if (p < 0.01) p = 0.0;
      } else if (m === medianVal) {
        p = tieBreakerProb;
      } else {
        const dist = m - medianVal;
        p = tieBreakerProb + (1.0 - tieBreakerProb) * (1 - Math.exp(-1.5 * dist));
      }
    }
    calibratedCurve.push(p);
  }

  // 2. Group past bids by mileage values to calculate pass/fail counts
  const groups = {};
  if (activeMileageData && activeMileageData.bids) {
    const bids = filterCleanBids(activeMileageData.bids);
    bids.forEach(b => {
      const val = b.mileage;
      if (!groups[val]) {
        groups[val] = { pass: 0, fail: 0 };
      }
      if (b.success === 'Y') {
        groups[val].pass++;
      } else {
        groups[val].fail++;
      }
    });
  }

  const passCounts = [];
  const failCounts = [];
  for (let i = 0; i <= maxAllowed; i++) {
    const group = groups[i] || { pass: 0, fail: 0 };
    passCounts.push(group.pass);
    failCounts.push(group.fail);
  }

  const labels = Array.from({ length: maxAllowed + 1 }, (_, i) => `${i}점`);
  const dataPoints = calibratedCurve.map(p => Math.round(p * 100)); // Convert to %

  // Styling arrays for point highlights
  const pointRadii = new Array(labels.length).fill(0); // Hide points normally
  const pointHoverRadii = new Array(labels.length).fill(4);
  const pointBgColors = new Array(labels.length).fill('rgba(0,0,0,0)');
  const pointBorderColors = new Array(labels.length).fill('rgba(0,0,0,0)');

  // Highlight current bid
  const bidIdx = Math.round(currentBid);
  if (bidIdx >= 0 && bidIdx < labels.length) {
    pointRadii[bidIdx] = 6;
    pointBgColors[bidIdx] = '#0070f3';
    pointBorderColors[bidIdx] = '#ffffff';
  }

  // Custom vertical line plugin for slider synchronization
  const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
      const activeVal = chart.config.options.plugins?.verticalLine?.xValue;
      if (activeVal !== undefined && activeVal !== null) {
        const xAxis = chart.scales.x;
        const xPixel = xAxis.getPixelForValue(activeVal);
        if (xPixel === undefined || isNaN(xPixel)) return;
        
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPixel, chart.chartArea.top);
        ctx.lineTo(xPixel, chart.chartArea.bottom);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0, 112, 243, 0.85)';
        ctx.setLineDash([5, 4]); // Dashed line
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Chart.js mixed chart configuration (Bars for past bids, Line for AI probability)
  aiChartInstance = new Chart(ctx, {
    type: 'bar',
    plugins: [verticalLinePlugin],
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: '과거 합격자',
          data: passCounts,
          backgroundColor: 'rgba(0, 112, 243, 0.25)', // Vercel blue with opacity
          borderColor: 'rgba(0, 112, 243, 0.7)',
          borderWidth: 1,
          stack: 'bidsStack',
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'bar',
          label: '과거 불합격자',
          data: failCounts,
          backgroundColor: 'rgba(238, 0, 0, 0.25)', // Danger red with opacity
          borderColor: 'rgba(238, 0, 0, 0.7)',
          borderWidth: 1,
          stack: 'bidsStack',
          yAxisID: 'y',
          order: 3
        },
        {
          type: 'line',
          label: '합격 예측 확률',
          data: dataPoints,
          borderColor: '#0070f3',
          borderWidth: 2,
          pointRadius: pointRadii,
          pointHoverRadius: pointHoverRadii,
          pointBackgroundColor: pointBgColors,
          pointBorderColor: pointBorderColors,
          pointBorderWidth: 1.5,
          fill: true,
          backgroundColor: function(context) {
            const chart = context.chart;
            const {ctx, chartArea} = chart;
            if (!chartArea) return null;
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(0, 112, 243, 0.12)');
            gradient.addColorStop(1, 'rgba(0, 112, 243, 0.0)');
            return gradient;
          },
          tension: 0.3,
          yAxisID: 'yProbability',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 10,
            font: { size: 10, weight: '500' },
            color: 'rgba(23, 23, 23, 0.7)'
          }
        },
        verticalLine: {
          xValue: currentBid
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              if (context.datasetIndex === 2) {
                return `${label}: ${val}%`;
              }
              return `${label}: ${val}명`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: 'rgba(0, 0, 0, 0.03)' },
          ticks: {
            color: 'rgba(23, 23, 23, 0.6)',
            font: { size: 9 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10
          }
        },
        y: {
          stacked: true,
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '지원자 수 (명)',
            color: 'rgba(23, 23, 23, 0.6)',
            font: { size: 9, weight: '600' }
          },
          grid: { color: 'rgba(0, 0, 0, 0.03)' },
          ticks: {
            color: 'rgba(23, 23, 23, 0.6)',
            font: { size: 9 },
            stepSize: 1,
            precision: 0
          }
        },
        yProbability: {
          type: 'linear',
          display: true,
          position: 'right',
          min: 0,
          max: 100,
          title: {
            display: true,
            text: '합격 확률 (%)',
            color: '#0070f3',
            font: { size: 9, weight: '600' }
          },
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            color: 'rgba(23, 23, 23, 0.6)',
            font: { size: 9 },
            stepSize: 25,
            callback: function(value) { return value + '%'; }
          }
        }
      }
    }
  });

  aiChartInstance.lookupKey = lookupKey;
}

// Render HTML chart bars grouped by mileage bids
function renderBidsChart(bids, maxMileage) {
  const container = document.getElementById('mileage-chart-container');
  container.innerHTML = '';

  const tableBody = document.getElementById('mileage-distribution-table-body');
  if (tableBody) {
    tableBody.innerHTML = '';
  }

  // Group bids by mileage value
  const groups = {};
  bids.forEach(b => {
    const val = b.mileage;
    if (!groups[val]) {
      groups[val] = { pass: 0, fail: 0 };
    }
    if (b.success === 'Y') {
      groups[val].pass++;
    } else {
      groups[val].fail++;
    }
  });

  // Sort mileage groups descending
  const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => b - a);

  if (sortedKeys.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px;">이력 데이터가 없습니다.</p>`;
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" style="padding: 12px; color: var(--text-muted);">이력 데이터가 없습니다.</td></tr>`;
    }
    return;
  }

  // Find max count of any group to scale the widths
  const maxCount = Math.max(...Object.values(groups).map(g => g.pass + g.fail));

  sortedKeys.forEach(val => {
    const { pass, fail } = groups[val];
    const total = pass + fail;
    const passPct = (pass / maxCount) * 100;
    const failPct = (fail / maxCount) * 100;

    // Render bar chart row
    const row = document.createElement('div');
    row.className = 'chart-bar-row';
    row.innerHTML = `
      <div class="chart-label">${val}점</div>
      <div class="chart-bar-wrapper">
        <div class="chart-bar-pass" style="width: ${passPct}%" title="합격: ${pass}명"></div>
        <div class="chart-bar-fail" style="width: ${failPct}%" title="불합격: ${fail}명"></div>
      </div>
      <div class="chart-count">${total}명 <small style="color:var(--text-muted)">(${pass}합)</small></div>
    `;
    container.appendChild(row);

    // Render table row
    if (tableBody) {
      const passRate = total > 0 ? ((pass / total) * 100).toFixed(1) : '0';
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--hairline)';
      tr.style.height = '32px';
      tr.innerHTML = `
        <td style="padding: 8px; font-weight: 600; color: var(--text-primary);">${val}점</td>
        <td style="padding: 8px; color: var(--success); font-weight: 500;">${pass}명</td>
        <td style="padding: 8px; color: var(--text-muted);">${fail}명</td>
        <td style="padding: 8px; color: var(--text-secondary);">${total}명</td>
        <td style="padding: 8px; font-weight: 600; color: ${pass > 0 ? 'var(--success)' : 'var(--text-muted)'};">${passRate}%</td>
      `;
      tableBody.appendChild(tr);
    }
  });
}

// Calculate predicted rank and success probability using tie-breaking rules
function calculateMileagePrediction(testMileage) {
  if (!activeMileageData) return;
  const { summary, bids } = activeMileageData;

  const outcomeBox = document.getElementById('predict-outcome-box');

  // Construct virtual applicant from user's current profile settings
  const myMajorCode = determineMajorStatus(activeCourseCode, myProfile);
                       
  // Look up if this course is marked as retake in selectedCourses
  const matchingSelected = selectedCourses.find(c => c.code === activeCourseCode);
  const isRetake = matchingSelected ? matchingSelected.isRetake : false;
  const firstTimeCode = isRetake ? 'N' : 'Y';

  const virtualApplicant = {
    rank: 999,
    mileage: testMileage,
    major: myMajorCode,
    grade: myProfile.grade,
    first_time: firstTimeCode,
    grad: myProfile.gradApp,
    applied_courses: myProfile.coursesCount,
    earned_ratio: `${myProfile.earnedCredits}/${myProfile.reqCredits}`,
    last_sem_ratio: `${myProfile.lastCredits}/${myProfile.maxCredits}`,
    success: 'Y',
    is_user: true
  };

  // Determine if Year Quotas are active for this course
  const yq = summary.year_quotas;
  const isYearQuotasActive = yq && (yq['1'] > 0 || yq['2'] > 0 || yq['3'] > 0 || yq['4'] > 0);

  // Filter out any existing user marker in case we run it multiple times
  let pool = bids.filter(b => !b.is_user);
  pool.push(virtualApplicant);

  let capacity = summary.capacity;
  let majorQuota = 0;
  
  // Parse global major quota limit and double major rule
  const majorQuotaMatch = summary.major_ratio ? summary.major_ratio.match(/^(\d+)(?:\((.+)\))?/) : null;
  const globalMajorQuota = majorQuotaMatch ? parseInt(majorQuotaMatch[1]) : 0;
  const includesDoubleMajor = majorQuotaMatch ? majorQuotaMatch[2] === 'Y' : false;
  const isMajorQuotaActive = globalMajorQuota > 0;
  const mqVal = globalMajorQuota;

  if (isYearQuotasActive) {
    // 1. Year Partitioning: Select only applicants matching user's Year (grade)
    const userGrade = myProfile.grade;
    pool = pool.filter(b => b.grade === userGrade);
    
    // Set capacity to user's Year quota
    capacity = yq[userGrade] || 0;
    
    // Calculate proportional major quota for this year
    majorQuota = globalMajorQuota > 0 ? Math.round(capacity * (globalMajorQuota / summary.capacity)) : 0;
    
    console.log(`[Year Quota Active] Pool Year: ${userGrade}, Quota Capacity: ${capacity}, Proportional Major Quota: ${majorQuota}, Includes Double Major: ${includesDoubleMajor}`);
  } else {
    majorQuota = globalMajorQuota;
    console.log(`[Year Quota Inactive] Capacity: ${capacity}, Major Quota: ${majorQuota}, Includes Double Major: ${includesDoubleMajor}`);
  }

  // Run 2-Stage Quota Matching
  const selectedApplicants = simulate2StageSelection(pool, capacity, majorQuota, includesDoubleMajor);

  // Find user's virtual rank and check success
  const isSuccess = selectedApplicants.some(b => b.is_user);

  // Calculate group-specific statistics for accurate user feedback
  const userGrade = myProfile.grade || 4;
  const yearCapacity = isYearQuotasActive ? (yq[userGrade] || 0) : summary.capacity;
  const userMajorStatus = determineMajorStatus(activeCourseCode, myProfile);
  const userMajorLabel = userMajorStatus === 'Y(Y)' ? '본전공자' : (userMajorStatus === 'Y(N)' ? '복수전공자' : '비전공자');

  const isBidProtected = (b) => {
    return b.major.startsWith('Y(Y)') || (includesDoubleMajor && b.major.startsWith('Y(N)'));
  };

  let userBelongsToProtectedGroup = false;
  if (userMajorStatus === 'Y(Y)') {
    userBelongsToProtectedGroup = true;
  } else if (userMajorStatus === 'Y(N)') {
    userBelongsToProtectedGroup = includesDoubleMajor;
  } else {
    userBelongsToProtectedGroup = false;
  }

  // Filter bids belonging to the user's specific group (excluding user marker)
  let groupBids = bids.filter(b => !b.is_user);
  let groupCapacityVal = summary.capacity;
  let groupLabel = "전체 정원";

  if (isYearQuotasActive && isMajorQuotaActive) {
    groupBids = groupBids.filter(b => {
      const inGrade = b.grade === userGrade;
      if (!inGrade) return false;
      const protectedBid = isBidProtected(b);
      return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
    });
    groupCapacityVal = yearCapacity;
    groupLabel = `${userGrade}학년 ${userBelongsToProtectedGroup ? '전공자' : '비전공자'} 정원`;
  } else if (isYearQuotasActive) {
    groupBids = groupBids.filter(b => b.grade === userGrade);
    groupCapacityVal = yearCapacity;
    groupLabel = `${userGrade}학년 정원`;
  } else if (isMajorQuotaActive) {
    groupBids = groupBids.filter(b => {
      const protectedBid = isBidProtected(b);
      return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
    });
    if (userBelongsToProtectedGroup) {
      groupCapacityVal = mqVal;
      groupLabel = "전공자 정원";
    } else {
      groupCapacityVal = Math.max(0, summary.capacity - mqVal);
      groupLabel = "비전공자 정원";
    }
  }

  // Construct the group pool including the virtual user applicant
  const groupPool = [...groupBids, virtualApplicant];
  const sortedGroupPool = [...groupPool].sort(compareBids);
  const groupUserIndex = sortedGroupPool.findIndex(b => b.is_user);
  const groupUserRank = groupUserIndex + 1;

  outcomeBox.className = `predict-result-box ${isSuccess ? 'pass' : 'fail'}`;
  
  if (isSuccess) {
    outcomeBox.innerHTML = `
      <div class="predict-status"><i data-lucide="check-circle" style="display:inline-block;vertical-align:middle;margin-right:6px;"></i> 합격 안전권 (예측)</div>
      <p class="predict-desc">
        이전 학기 기준 대조 시 <strong>${groupLabel} (${groupCapacityVal}명)</strong> 내에 안착합니다.<br>
        예상 석차: <strong>${groupUserRank}위 / ${groupCapacityVal}명</strong> [그룹 내 총 ${groupPool.length}명 신청]
        ${isYearQuotasActive ? `<br><small style="color:var(--text-muted)">* ${myProfile.grade}학년 정원 제한 (${yearCapacity}명) 기준 시뮬레이션 적용됨</small>` : ''}
      </p>
    `;
  } else {
    // Find how many ranks the user is missing to pass
    const difference = groupUserRank - groupCapacityVal;
    outcomeBox.innerHTML = `
      <div class="predict-status"><i data-lucide="x-circle" style="display:inline-block;vertical-align:middle;margin-right:6px;"></i> 합격 불확실 / 대기 (예측)</div>
      <p class="predict-desc">
        정원 외 대기 순번으로 밀려날 가능성이 큽니다.<br>
        예상 석차: <strong>${groupUserRank}위 / ${groupCapacityVal}명</strong> [그룹 내 총 ${groupPool.length}명 신청] (정원 대비 <strong>${difference}명 초과</strong>)
        ${isYearQuotasActive ? `<br><small style="color:var(--text-muted)">* ${myProfile.grade}학년 정원 제한 (${yearCapacity}명) 기준 시뮬레이션 적용됨</small>` : ''}
      </p>
    `;
  }

  // 5. Calculate Multi-Semester Safety Index based on historical cutlines
  const history = activeMileageData.history || [];
  
  // Calculate current simulated grade-specific cut and global cut to obtain grade pressure ratio
  const simPassBids = selectedApplicants.filter(b => {
    if (b.remark) return false;
    
    // Filter to only include the user's competition group for accurate pressure ratio
    if (isYearQuotasActive && isMajorQuotaActive) {
      if (b.grade !== userGrade) return false;
      const protectedBid = isBidProtected(b);
      return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
    } else if (isYearQuotasActive) {
      return b.grade === userGrade;
    } else if (isMajorQuotaActive) {
      const protectedBid = isBidProtected(b);
      return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
    }
    return true;
  });
  const simGradeCut = simPassBids.length > 0 ? Math.min(...simPassBids.map(b => b.mileage)) : summary.min_mileage;
  
  const sortedAll = [...pool].sort(compareBids);
  const globalPass = sortedAll.slice(0, summary.capacity).filter(b => !b.remark);
  const simGlobalCut = globalPass.length > 0 ? Math.min(...globalPass.map(b => b.mileage)) : summary.min_mileage;
  
  const pressureFactor = (simGlobalCut > 0) ? (simGradeCut / simGlobalCut) : 1.0;
  const hasUnprotectedCap = isMajorQuotaActive && !userBelongsToProtectedGroup;
  
  let totalScore = 0;
  history.forEach(h => {
    // Estimate historical grade-specific min/avg using current grade pressure ratio
    const estMin = h.min_mileage * pressureFactor;
    const estAvg = h.average_mileage * pressureFactor;
    const threshold = (estMin + estAvg) / 2;

    // Check under-enrollment: Unprotected groups don't get the global free pass
    let isUnderEnrolledSemester = false;
    if (hasUnprotectedCap) {
      isUnderEnrolledSemester = false;
    } else {
      isUnderEnrolledSemester = (h.applicants <= h.capacity);
    }

    if (isUnderEnrolledSemester) {
      // 해당 학기가 미달이었던 경우: 1점 이상만 넣으면 무조건 합격이므로 안전(1.0) 처리
      if (testMileage >= 1) {
        totalScore += 1.0;
      } else {
        totalScore += 0.0; // 0점은 위험
      }
    } else {
      // 경쟁이 발생했던 학기인 경우: 기존 로직(평균/최소 컷 비교) 사용
      if (testMileage >= estAvg) {
        totalScore += 1.0; // Safe (Above average)
      } else if (testMileage >= threshold) {
        totalScore += 0.5; // Moderate (Above mid-point)
      } else {
        totalScore += 0.0; // High Risk (Below threshold)
      }
    }
  });
  
  const safetyPct = history.length > 0 ? Math.round((totalScore / history.length) * 100) : 0;
  
  // Append safety index display to outcomeBox
  const safetyRow = document.createElement('div');
  safetyRow.className = 'safety-index-row';
  safetyRow.style.cssText = 'margin-top: 10px; font-size: 11.5px; color: var(--text-secondary); border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px; display: flex; align-items: center; justify-content: space-between;';
  
  const safetyColor = safetyPct >= 80 ? 'var(--success)' : safetyPct >= 50 ? 'var(--warning)' : 'var(--danger)';
  const safetyText = safetyPct >= 80 ? '안전' : safetyPct >= 50 ? '경계/대기' : '불합격 위험';
  
  safetyRow.innerHTML = `
    <span>다학기 종합 안전도 (${safetyText}):</span>
    <div>
      <strong style="color: ${safetyColor}; font-size: 13px;">${safetyPct}%</strong>
      <small style="color: var(--text-muted); margin-left: 4px;">(${history.length}개 학기 기준 대조)</small>
    </div>
  `;
  outcomeBox.appendChild(safetyRow);

  lucide.createIcons();
}

// Simulate 2-Stage Quota selection on a given pool of applicants
function simulate2StageSelection(applicants, capacity, majorQuota, includesDoubleMajor) {
  if (capacity <= 0) return [];
  
  // If no major quota is set, do a simple sort and cut
  if (majorQuota <= 0) {
    const sorted = [...applicants].sort(compareBids);
    return sorted.slice(0, capacity);
  }

  // Helper to check if applicant is protected
  const isProtected = (a) => {
    if (includesDoubleMajor) {
      return a.major.startsWith('Y');
    } else {
      return a.major.startsWith('Y(Y)');
    }
  };

  // Stage 1: Select majors up to majorQuota limit
  const majors = applicants.filter(isProtected);
  const sortedMajors = [...majors].sort(compareBids);
  const selectedMajors = sortedMajors.slice(0, majorQuota);

  // Stage 2: General selection from remaining applicants
  const selectedIds = new Set(selectedMajors.map(m => m.is_user ? 'user' : `${m.rank}-${m.mileage}`));
  
  const remaining = applicants.filter(a => {
    const id = a.is_user ? 'user' : `${a.rank}-${a.mileage}`;
    return !selectedIds.has(id);
  });
  const sortedRemaining = [...remaining].sort(compareBids);

  // General seats available in Stage 2
  const generalSeatsAvailable = capacity - selectedMajors.length;
  // Strictly cap the number of unprotected (non-major) students at (capacity - majorQuota)
  const maxUnprotectedSeats = Math.max(0, capacity - majorQuota);

  const selectedGeneral = [];
  let unprotectedSelectedCount = 0;

  for (let i = 0; i < sortedRemaining.length; i++) {
    if (selectedGeneral.length >= generalSeatsAvailable) {
      break;
    }
    const a = sortedRemaining[i];
    const protectedBid = isProtected(a);

    if (protectedBid) {
      selectedGeneral.push(a);
    } else {
      if (unprotectedSelectedCount < maxUnprotectedSeats) {
        selectedGeneral.push(a);
        unprotectedSelectedCount++;
      }
    }
  }

  return [...selectedMajors, ...selectedGeneral];
}

// Compare two bids by Yonsei priority rules
function compareBids(a, b) {
  // 1. Mileage (Desc)
  if (b.mileage !== a.mileage) return b.mileage - a.mileage;
  
  // 2. Major Priority
  // Y(Y) > Y(N) > N(N)
  const getMajorScore = (m) => {
    if (!m) return 0;
    if (m.startsWith('Y(Y)')) return 3;
    if (m.startsWith('Y(N)')) return 2;
    return 1;
  };
  const aMajor = getMajorScore(a.major);
  const bMajor = getMajorScore(b.major);
  if (bMajor !== aMajor) return bMajor - aMajor;
  
  // 3. Applied Course Count (6 is highest priority)
  const getCountScore = (c) => {
    if (c === 6) return 10;
    if (c === 5) return 9;
    if (c === 4) return 8;
    if (c === 3) return 7;
    if (c === 2) return 6;
    if (c === 1) return 5;
    return 0; // 7, 8 etc have lower priority
  };
  const aCnt = getCountScore(a.applied_courses);
  const bCnt = getCountScore(b.applied_courses);
  if (bCnt !== aCnt) return bCnt - aCnt;
  
  // 4. Graduation Application Y/N (Y > N)
  const aGrad = a.grad === 'Y' ? 1 : 0;
  const bGrad = b.grad === 'Y' ? 1 : 0;
  if (bGrad !== aGrad) return bGrad - aGrad;
  
  // 5. First Time Enroll Y/N (Y > N)
  const aFirst = a.first_time === 'Y' ? 1 : 0;
  const bFirst = b.first_time === 'Y' ? 1 : 0;
  if (bFirst !== aFirst) return bFirst - aFirst;
  
  // 6. Earned Credits Ratio (Desc)
  const getRatioScore = (r) => {
    if (!r || typeof r !== 'string' || !r.includes('/')) return 0;
    const parts = r.split('/');
    const cur = parseFloat(parts[0]);
    const req = parseFloat(parts[1]);
    if (isNaN(cur) || isNaN(req) || req === 0) return 0;
    return cur / req;
  };
  const aRatio = getRatioScore(a.earned_ratio);
  const bRatio = getRatioScore(b.earned_ratio);
  if (bRatio !== aRatio) return bRatio - aRatio;
  
  // 7. Last Semester Ratio (Desc)
  const aLast = getRatioScore(a.last_sem_ratio);
  const bLast = getRatioScore(b.last_sem_ratio);
  if (bLast !== aLast) return bLast - aLast;
  
  return 0; // tie
}

// ─── 기초과학 전공필수급 과목 판별 ───────────────────────────────────────────
// 과목명(title) 또는 과목코드(code)에 아래 키워드가 포함되면 전공필수/기초에 준하는 과목으로 처리합니다.
// 대상: 일반물리학실험, 일반화학실험, 미적분학과벡터해석, 공학수학, 공학화학실험, 공학물리학실험
const CORE_SCIENCE_KEYWORDS = [
  '일반물리학실험', '일물실',
  '일반화학실험',   '일화실',
  '미적분학과벡터해석', '미적벡', '미적분학',
  '공학수학',       '공수',
  '공학화학실험',   '공화실',
  '공학물리학실험', '공물실',
];

/**
 * 과목명(title) 또는 과목코드(code)가 기초과학 전공필수급 과목인지 판별합니다.
 * @param {string} code  - 과목코드 (예: MAT2101)
 * @param {string} title - 과목명   (예: 미적분학과벡터해석)
 * @returns {boolean}
 */
function isCoreScienceCourse(code, title) {
  const haystack = ((code || '') + ' ' + (title || '')).toLowerCase();
  return CORE_SCIENCE_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}


// Calculate group-specific (Major status + Year quota partition) historical cutoff dynamically
function calculateGroupSpecificCutoff(course, profile) {
  // If historical bids or summary is not loaded yet, fallback to overall precomputed median or default
  if (!course.mileageBids || !course.mileageSummary) {
    const key = `${course.code}-${course.division}`;
    if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key]) {
      const userMajor = determineMajorStatus(course.code, profile, course.title);
      const isMajor = userMajor !== 'N(N)';
      const groupPred = isMajor ? precomputedCurves.curves[key].major : precomputedCurves.curves[key].non_major;
      const userGrade = profile.grade || 4;
      const gradePred = groupPred[`grade_${userGrade}`] || groupPred.grade_4 || groupPred;
      return gradePred.median;
    }
    return course.mileageSummary ? (course.mileageSummary.min_mileage || 12.0) : 12.0;
  }

  const bids = course.mileageBids;
  const summary = course.mileageSummary;
  const userMajor = determineMajorStatus(course.code, profile, course.title);
  const userGrade = profile.grade;

  // Determine if Year Quotas partition is active
  const yq = summary.year_quotas;
  const isYearQuotasActive = yq && (yq['1'] > 0 || yq['2'] > 0 || yq['3'] > 0 || yq['4'] > 0);

  let pool = bids.filter(b => !b.is_user); // Extract only clean historical bids
  let capacity = summary.capacity;
  let majorQuota = 0;

  // Parse global major quota limit
  const majorQuotaMatch = summary.major_ratio ? summary.major_ratio.match(/^(\d+)(?:\((.+)\))?/) : null;
  const globalMajorQuota = majorQuotaMatch ? parseInt(majorQuotaMatch[1]) : 0;
  const includesDoubleMajor = majorQuotaMatch ? majorQuotaMatch[2] === 'Y' : false;

  if (isYearQuotasActive) {
    // Stage 1 filter: only users in the same grade compete for that grade's quota
    pool = pool.filter(b => b.grade === userGrade);
    capacity = yq[userGrade] || 0;
    majorQuota = globalMajorQuota > 0 ? Math.round(capacity * (globalMajorQuota / summary.capacity)) : 0;
  } else {
    majorQuota = globalMajorQuota;
  }

  if (pool.length === 0) {
    // If no historical bids found for this grade, fallback to overall min
    return summary.min_mileage || 1.0;
  }

  // Simulate 2-Stage Quota Matching selection on the historical pool
  const selected = simulate2StageSelection(pool, capacity, majorQuota, includesDoubleMajor);
  const selectedRanks = new Set(selected.map(b => b.rank));

  // Extract all candidates in my specific major group (e.g. Y(Y), Y(N), or N(N))
  const myGroupBids = pool.filter(b => b.major === userMajor);

  if (myGroupBids.length === 0) {
    // If no one in my group applied historically, fallback to overall min
    return summary.min_mileage || 1.0;
  }

  const myGroupAccepted = myGroupBids.filter(b => selectedRanks.has(b.rank));
  const myGroupRejected = myGroupBids.filter(b => !selectedRanks.has(b.rank));

  // Cutoff is the maximum bid of rejected candidates in my group.
  const lookupKey = `${course.code}-${course.division}`;
  let q10SafetyFloor = 1.0;
  if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[lookupKey]) {
    const isMajor = userMajor !== 'N(N)';
    const groupPred = isMajor ? precomputedCurves.curves[lookupKey].major : precomputedCurves.curves[lookupKey].non_major;
    const userGrade = profile.grade || 4;
    const gradePred = groupPred[`grade_${userGrade}`] || groupPred.grade_4 || groupPred;
    const rawQ10 = gradePred.q10;
    if (isMajor) {
      q10SafetyFloor = Math.max(1.0, rawQ10 - 10.0);
    } else {
      q10SafetyFloor = Math.max(1.0, rawQ10);
    }
  }

  if (myGroupRejected.length > 0) {
    return Math.max(q10SafetyFloor, Math.max(...myGroupRejected.map(b => b.mileage)));
  } else if (myGroupAccepted.length > 0) {
    return q10SafetyFloor;
  }
}

// Determine dynamic major code status (Y(Y) first major, Y(N) double major, N(N) non-major)
function determineMajorStatus(courseCode, profile, courseTitle) {
  if (!courseCode) return 'N(N)';

  const firstMajor = profile.firstMajor;
  const secondMajor = profile.secondMajor;
  
  let matchesFirst = false;
  let matchesSecond = false;
  
  if (YONSEI_MAJORS[firstMajor]) {
    matchesFirst = YONSEI_MAJORS[firstMajor].prefixes.some(p => courseCode.toUpperCase().startsWith(p));
  }
  if (YONSEI_MAJORS[secondMajor]) {
    matchesSecond = YONSEI_MAJORS[secondMajor].prefixes.some(p => courseCode.toUpperCase().startsWith(p));
  }
  
  if (matchesFirst) return 'Y(Y)';
  if (matchesSecond) return 'Y(N)';
  return 'N(N)';
}

// Prefetch mileage details dynamically for the Advisor card
async function fetchMileageSummaryForAdvisor(selectedCourse) {
  const lsKey = `mileage_${selectedCourse.code}_${selectedCourse.division}`;

  const clampIfNeeded = (course) => {
    if (!course.mileageSummary) return;
    const maxVal = course.mileageSummary.max_allowed_mileage || 36;
    if (course.mileage > maxVal) {
      console.log(`[Async Advisor Clamping] Clamped ${course.code}-${course.division} from ${course.mileage} to ${maxVal}`);
      course.mileage = maxVal;
      saveDataToStorage();
      renderSelectedCoursesList();
      renderTimetableGrid();
    }
  };

  // L0: 브라우저 캐시 확인
  const cached = lsGet(lsKey, 'mileage');
  if (cached) {
    selectedCourse.mileageSummary = cached.summary;
    selectedCourse.mileageBids = cached.bids;
    selectedCourse.mileageHistory = cached.history;
    clampIfNeeded(selectedCourse);
    runAdvisorDiagnostic();
    return;
  }

  try {
    const res = await fetch(`/api/mileage?code=${selectedCourse.code}&division=${selectedCourse.division}`);
    const data = await res.json();
    if (data.success) {
      selectedCourse.mileageSummary = data.data.summary;
      selectedCourse.mileageBids = data.data.bids;
      selectedCourse.mileageHistory = data.data.history;
      lsSet(lsKey, data.data);  // 브라우저 캐시에 저장
      clampIfNeeded(selectedCourse);
      runAdvisorDiagnostic();
    }
  } catch (err) {
    console.log("Failed to fetch summary for advisor", err);
  }
}

// Get course advisor diagnostic advice text as HTML
function getAdvisorSuggestionHTML(c) {
  if (!c.mileageSummary || !c.mileageBids) {
    return `<div style="font-weight:600;margin-bottom:4px;">⏳ 데이터 분석 중</div><p style="margin:0;color:var(--text-muted);font-size:11px;">과거 이력 데이터를 실시간 분석하고 있습니다.</p>`;
  }

  const maxTotal = myProfile.maxTotalMileage || (myProfile.firstMajor === 'stats' ? 72 : 76);
  const currentSum = selectedCourses.reduce((sum, course) => sum + course.mileage, 0);
  const alloc = c.mileage;
  const limit = c.mileageSummary.max_allowed_mileage;

  // Find Year Cutline
  const yearCut = Math.round(calculateGroupSpecificCutoff(c, myProfile));
  const isBudgetFull = currentSum >= maxTotal - 2;

  // Pre-calculate redirectable pool
  let totalSurplus = 0;
  const savableCourses = [];
  selectedCourses.forEach(course => {
    if (!course.mileageSummary || !course.mileageBids) return;
    const cut = Math.round(calculateGroupSpecificCutoff(course, myProfile));
    const a = course.mileage;
    if (a > cut + 2) totalSurplus += (a - (cut + 2));
    if (a < cut) {
      savableCourses.push({ code: course.code, title: course.title, needed: cut - a });
    }
  });
  const unspent = Math.max(0, maxTotal - currentSum);
  const pool = totalSurplus + unspent;

  // Diagnostic Rules logic
  if (alloc > limit) {
    return `<div style="font-weight:700;color:var(--danger);margin-bottom:4px;font-size:11.5px;">⚠️ 한도 초과 (최대 ${limit}점)</div>
            <p style="margin:0;font-size:11px;line-height:1.4;">마일리지가 과목 입력 한도를 초과했습니다. 배분 점수(${alloc}점)를 당장 줄이셔야 정식 수강신청이 가능합니다.</p>`;
  } else if (alloc === 0) {
    if (isBudgetFull) {
      return `<div style="font-weight:700;color:var(--accent-light);margin-bottom:4px;font-size:11.5px;">🌱 전략적 배제 (추정컷 ${yearCut}점)</div>
              <p style="margin:0;font-size:11px;line-height:1.4;">예산 부족으로 배분하지 않았습니다. 본 과목은 컷오프가 높아 어설픈 투자를 막기 위해 전략적으로 제외되었습니다.</p>`;
    } else {
      return `<div style="font-weight:700;color:var(--warning);margin-bottom:4px;font-size:11.5px;">ℹ️ 미배분 과목</div>
              <p style="margin:0;font-size:11px;line-height:1.4;">점수가 입력되지 않았습니다. 과거 학년 합격선인 <strong>${yearCut}점</strong> 이상 투자를 추천합니다.</p>`;
    }
  } else if (alloc < yearCut) {
    return `<div style="font-weight:700;color:var(--danger);margin-bottom:4px;font-size:11.5px;">❌ 과소 투자 (과거컷 ${yearCut}점)</div>
            <p style="margin:0;font-size:11px;line-height:1.4;">배분한 점수(${alloc}점)가 과거 합격선보다 낮아 <strong>탈락 위험이 매우 큽니다.</strong> 점수를 보강하세요.</p>`;
  } else if (alloc > yearCut + 6 && yearCut < 18) {
    const isRedirectable = pool > 0 && savableCourses.some(sc => sc.code !== c.code && sc.needed <= pool);
    if (isRedirectable) {
      const sc = savableCourses.find(sc => sc.code !== c.code && sc.needed <= pool);
      return `<div style="font-weight:700;color:var(--warning);margin-bottom:4px;font-size:11.5px;">⚠️ 과다 투자 경고 (적정 ${yearCut+2}점)</div>
              <p style="margin:0;font-size:11px;line-height:1.4;">과거 합격선 대비 과도하게 투자되었습니다. <strong>${yearCut+2}점</strong> 선으로 조율하고 남은 표를 위험한 과목(예: ${sc.title})으로 재배분하세요.</p>`;
    } else {
      return `<div style="font-weight:700;color:var(--success);margin-bottom:4px;font-size:11.5px;">✅ 안정 버퍼 확보 (과거컷 ${yearCut}점)</div>
              <p style="margin:0;font-size:11px;line-height:1.4;">과거 합격선보다 충분히 넉넉히 배분(${alloc}점)하여 철벽 방어 중입니다.</p>`;
    }
  } else {
    return `<div style="font-weight:700;color:var(--success);margin-bottom:4px;font-size:11.5px;">✅ 적정 투자 (과거컷 ${yearCut}점)</div>
            <p style="margin:0;font-size:11px;line-height:1.4;">과거 합격 컷오프 기준 대단히 합리적이고 안전하게 마일리지가 분배되었습니다.</p>`;
  }
}

// Run Strategic Advisor diagnosis rules (Simplified - No list element manipulation)
function runAdvisorDiagnostic() {
  const budgetText = document.getElementById('allocated-mileage-label'); // Sync direct with top-header budget counter!
  const maxTotal = myProfile.maxTotalMileage || (myProfile.firstMajor === 'stats' ? 72 : 76);
  const currentSum = selectedCourses.reduce((sum, c) => sum + c.mileage, 0);

  // Update budget display label
  if (budgetText) {
    budgetText.textContent = `${currentSum} / ${maxTotal}`;
    // Clear inline color override for warning/danger states so CSS styles can take over correctly!
    budgetText.style.color = (currentSum > maxTotal || currentSum === maxTotal) ? '#ffffff' : '';
  }

  // Live update tooltips content for all selected items
  selectedCourses.forEach(c => {
    const tooltip = document.getElementById(`tooltip-${c.code}-${c.division}`);
    if (tooltip) {
      tooltip.innerHTML = getAdvisorSuggestionHTML(c);
    }
  });

  // Mark Monte Carlo outdated on every diagnostic change to request manual trigger
  markMonteCarloOutdated();
}

// Sigmoid helper for tie-breaker calculations
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Strategic Auto-Allocation Solver using MCKP Dynamic Programming & 7-stage Tie-Breaking Curves
function autoAllocateMileage() {
  if (selectedCourses.length === 0) {
    alert("시간표에 먼저 과목을 추가해 주세요!");
    return;
  }

  const maxTotal = myProfile.maxTotalMileage || (myProfile.firstMajor === 'stats' ? 72 : 76);
  console.log(`[Auto-Allocation] Start. Target budget: ${maxTotal}`);

  // Build items array with curves (with index indicating preference rank)
  const items = selectedCourses.map((c, index) => {
    const key = `${c.code}-${c.division}`;
    let maxAllowed = 36;
    if (c.mileageSummary && c.mileageSummary.max_allowed_mileage) {
      maxAllowed = c.mileageSummary.max_allowed_mileage;
    } else if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key]) {
      maxAllowed = precomputedCurves.curves[key].max_allowed || 36;
    }

    let baseCurve = new Array(maxAllowed + 1).fill(0.0);
    let medianVal = 12.0;

    // 1. Get base curve from precomputed curves or generate fallback
    if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key]) {
      const pData = precomputedCurves.curves[key];
      const isMajor = determineMajorStatus(c.code, myProfile) !== 'N(N)';
      const groupData = isMajor ? pData.major : pData.non_major;
      const userGrade = myProfile.grade || 4;
      const gradeData = groupData[`grade_${userGrade}`] || groupData.grade_4 || groupData;
      baseCurve = [...gradeData.prob_curve];
      medianVal = gradeData.median;
      if (baseCurve.length > maxAllowed + 1) {
        baseCurve = baseCurve.slice(0, maxAllowed + 1);
      } else if (baseCurve.length < maxAllowed + 1) {
        while (baseCurve.length < maxAllowed + 1) {
          baseCurve.push(baseCurve[baseCurve.length - 1] || 1.0);
        }
      }
    } else {
      // Fallback: Generate simple logistic curve from historical minimum or default
      let cutVal = 12.0;
      if (c.mileageSummary) {
        cutVal = c.mileageSummary.min_mileage || 12.0;
        maxAllowed = c.mileageSummary.max_allowed_mileage || 36;
      }
      medianVal = cutVal;
      const k = 2.197 / Math.max(cutVal * 0.2, 1.5);
      baseCurve = [];
      for (let m = 0; m <= maxAllowed; m++) {
        baseCurve.push(1 / (1 + Math.exp(-k * (m - cutVal))));
      }
    }

    // 1.5 DYNAMIC OVERRIDE: Calculate exact group-specific historical cutoff for user's major/grade!
    medianVal = calculateGroupSpecificCutoff(c, myProfile);

    // 2. Calibrate curve using 7-stage tie-breaker rules
    const privilegeScore = computePrivilegeScore(myProfile, c.code);
    const window = 3;
    const maxAdjustment = 0.25;
    const steepness = 5.0;
    const rawCalibrated = baseCurve.map((p, m) => {
      // Tie-breaker only applies to break ties at or above the median cutoff.
      // If our mileage is strictly less than the cutoff, we fail regardless of tie-breakers.
      if (m < medianVal) return p;
      const dist = Math.abs(m - medianVal);
      if (dist > window) return p;
      const rho = Math.max(0, 1 - dist / window);
      const adjustment = rho * privilegeScore * maxAdjustment * sigmoid(steepness * privilegeScore);
      return Math.min(1.0, Math.max(0.0, p + adjustment));
    });

    // Enforce monotonic non-decreasing (CDF property)
    const calibratedCurve = [];
    let currentMax = 0.0;
    for (let m = 0; m < rawCalibrated.length; m++) {
      currentMax = Math.max(currentMax, rawCalibrated[m]);
      calibratedCurve.push(currentMax);
    }

    // 3. Determine course weight and constraints (based on drag-and-drop rank index)
    const isCore = isCoreScienceCourse(c.code, c.title);
    const isRequired = isCore || (c.classification && (c.classification.includes('필') || c.classification.includes('기초') || c.classification.includes('전기')));
    
    // index-based weighting curve (Rank 1 has highest weight)
    let weight = 1.0;
    if (index === 0) weight = isRequired ? 2.5 : 2.0;
    else if (index === 1) weight = isRequired ? 2.0 : 1.7;
    else if (index === 2) weight = isRequired ? 1.5 : 1.3;
    else if (index === 3) weight = isRequired ? 1.0 : 0.9;
    else weight = 0.5;

    // Minimum safety bid threshold constraint (Rule 2)
    // If we allocate mileage to this course, it must be at least Math.max(1, Math.round(median - 3)) to avoid waste.
    const minSafetyBid = Math.max(1, Math.round(medianVal - 3));

    return {
      course: c,
      key: key,
      maxAllowed: maxAllowed,
      curve: calibratedCurve,
      weight: weight,
      median: medianVal,
      minSafetyBid: minSafetyBid
    };
  });

  // 4. API 호출: Python Credit-Augmented 2D DP 최적화 엔진
  const payload = {
    courses: items.map(item => ({
      key: item.key,
      prob_curve: item.curve,
      weight: item.weight,
      credit_hours: item.course.credits || 3,
      max_allowed: item.maxAllowed,
    })),
    total_budget: maxTotal,
    target_credits: myProfile.targetCredits || 9,
    target_prob: myProfile.targetProb || 0.85,
  };

  // 로딩 표시
  const allocBtn = document.getElementById('auto-allocate-btn');
  if (allocBtn) { allocBtn.disabled = true; allocBtn.textContent = '최적화 중...'; }

  fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'API error');

      const allocations = data.allocations;
      const riskReport  = data.risk_report || {};

      // 5. Post-Processing: 잔여 예산을 활성 과목에 배분 (API fallback 보완)
      let usedBudget = Object.values(allocations).reduce((a, b) => a + b, 0);
      let remainingBudget = maxTotal - usedBudget;
      if (remainingBudget > 0) {
        // weight 높은 순 → P 낮은 순으로 보충
        const activeItems = items
          .filter(it => (allocations[it.key] || 0) > 0 && (allocations[it.key] || 0) < it.maxAllowed)
          .sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            return (a.curve[allocations[a.key]] || 0) - (b.curve[allocations[b.key]] || 0);
          });
        let i = 0;
        while (remainingBudget > 0 && activeItems.length > 0) {
          const it = activeItems[i % activeItems.length];
          if (allocations[it.key] < it.maxAllowed) {
            allocations[it.key]++;
            remainingBudget--;
          }
          i++;
          if (i > maxTotal) break; // safety
        }
      }

      // 6. 상태 업데이트 및 UI 렌더링
      selectedCourses.forEach(c => {
        const key = `${c.code}-${c.division}`;
        c.mileage = allocations[key] !== undefined ? allocations[key] : 0;
      });
      renderSelectedCoursesList();
      saveDataToStorage();

      // 7. Monte Carlo 리스크 시뮬레이션 트리거
      runMonteCarloRiskSimulation();

      // 8. 결과 안내
      const allocatedSum = Object.values(allocations).reduce((a, b) => a + b, 0);
      const achievedProb = riskReport.achieved_prob != null
        ? `\nP(${riskReport.target_credits}학점 이상 확보) = ${(riskReport.achieved_prob * 100).toFixed(1)}%`
        : '';
      const fallbackNote = riskReport.fallback ? '\n(⚠️ 엔진 미연결 — 비례 배분 적용)' : '';
      alert(`자동 최적 분배 완료!\n총 ${maxTotal}점 중 ${allocatedSum}점이 배분되었습니다.${achievedProb}${fallbackNote}\n\n상세 리스크 분석은 하단의 리스크 대시보드를 참고해 주세요.`);
    })
    .catch(err => {
      console.warn('[Auto-Allocation] API 호출 실패, JS 로컬 DP로 fallback:', err);

      // ── Fallback: 기존 JS 1D MCKP DP ───────────────────────────────────────
      const n = items.length;
      const dp = Array.from({ length: n + 1 }, () => new Array(maxTotal + 1).fill(-1.0));
      dp[0][0] = 0.0;
      const choice = Array.from({ length: n + 1 }, () => new Array(maxTotal + 1).fill(0));

      for (let i = 1; i <= n; i++) {
        const item = items[i - 1];
        const curve = item.curve;
        const w_i = item.weight;
        for (let budget = 0; budget <= maxTotal; budget++) {
          for (let bid = 0; bid <= Math.min(item.maxAllowed, budget); bid++) {
            if (bid > 0 && bid < item.minSafetyBid) continue;
            const prevBudget = budget - bid;
            if (dp[i - 1][prevBudget] >= 0.0) {
              const val = dp[i - 1][prevBudget] + w_i * (curve[bid] || 0);
              if (val > dp[i][budget]) { dp[i][budget] = val; choice[i][budget] = bid; }
            }
          }
        }
      }

      let maxUtility = -1.0, bestBudget = 0;
      for (let b = 0; b <= maxTotal; b++) {
        if (dp[n][b] > maxUtility) { maxUtility = dp[n][b]; bestBudget = b; }
      }

      const allocations = {};
      let currentBudget = bestBudget;
      for (let i = n; i >= 1; i--) {
        const bid = choice[i][currentBudget];
        allocations[items[i - 1].key] = bid;
        currentBudget -= bid;
      }

      let remainingBudget = maxTotal - bestBudget;
      if (remainingBudget > 0) {
        let added = true;
        while (remainingBudget > 0 && added) {
          added = false;
          let activeItems = items.filter(it => {
            const cur = allocations[it.key];
            const lim = Math.min(it.maxAllowed, (it.course.mileageSummary ? it.course.mileageSummary.max_allowed_mileage : 36));
            return cur > 0 && cur < lim && (it.curve[cur] || 0) < 0.98;
          });
          if (!activeItems.length) activeItems = items.filter(it => {
            const cur = allocations[it.key];
            const lim = Math.min(it.maxAllowed, (it.course.mileageSummary ? it.course.mileageSummary.max_allowed_mileage : 36));
            return cur > 0 && cur < lim;
          });
          activeItems.sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            return (a.curve[allocations[a.key]] || 0) - (b.curve[allocations[b.key]] || 0);
          });
          if (activeItems.length > 0) {
            allocations[activeItems[0].key]++;
            remainingBudget--;
            added = true;
          }
        }
      }

      selectedCourses.forEach(c => {
        const key = `${c.code}-${c.division}`;
        c.mileage = allocations[key] !== undefined ? allocations[key] : 0;
      });
      renderSelectedCoursesList();
      saveDataToStorage();
      runMonteCarloRiskSimulation();

      const allocatedSum = maxTotal - remainingBudget;
      alert(`자동 최적 분배 완료! (로컬 DP)\n총 ${maxTotal}점 중 ${allocatedSum}점이 배분되었습니다.\n\n기대 효용 합계: ${maxUtility.toFixed(4)}\n상세 리스크 분석은 하단의 리스크 대시보드를 참고해 주세요.`);
    })
    .finally(() => {
      if (allocBtn) { allocBtn.disabled = false; allocBtn.textContent = '자동 최적 분배'; }
    });
}

// 특정 마일리지 베팅 점수(bid)에 따른 보정된 합격 확률 반환 공통 함수
function getCourseProbability(c, bid) {
  const key = `${c.code}-${c.division}`;

  // 1. Fallback to precomputed curves if historical bids are not loaded yet
  if (!c.mileageBids || !c.mileageSummary) {
    if (precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key]) {
      const pData = precomputedCurves.curves[key];
      const isMajor = determineMajorStatus(c.code, myProfile) !== 'N(N)';
      const groupData = isMajor ? pData.major : pData.non_major;
      const userGrade = myProfile.grade || 4;
      const gradeData = groupData[`grade_${userGrade}`] || groupData.grade_4 || groupData;
      const baseCurve = [...gradeData.prob_curve];
      return baseCurve[Math.min(bid, baseCurve.length - 1)] || 0.0;
    }
    let cutVal = c.mileageSummary ? (c.mileageSummary.min_mileage || 12.0) : 12.0;
    const k = 2.197 / Math.max(cutVal * 0.2, 1.5);
    return 1 / (1 + Math.exp(-k * (bid - cutVal)));
  }

  const bids = c.mileageBids;
  const summary = c.mileageSummary;
  const userGrade = myProfile.grade || 4;
  const userMajorStatus = determineMajorStatus(c.code, myProfile);
  const majorQuotaMatch = summary.major_ratio ? summary.major_ratio.match(/^(\d+)(?:\((.+)\))?/) : null;
  const isMajorQuotaActive = majorQuotaMatch && parseInt(majorQuotaMatch[1]) > 0;
  const mqVal = isMajorQuotaActive ? parseInt(majorQuotaMatch[1]) : 0;
  const includesDoubleMajor = majorQuotaMatch && majorQuotaMatch[2] === 'Y';

  const isBidProtected = (b) => {
    return b.major.startsWith('Y(Y)') || (includesDoubleMajor && b.major.startsWith('Y(N)'));
  };

  let userBelongsToProtectedGroup = false;
  if (userMajorStatus === 'Y(Y)') {
    userBelongsToProtectedGroup = true;
  } else if (userMajorStatus === 'Y(N)') {
    userBelongsToProtectedGroup = includesDoubleMajor;
  } else {
    userBelongsToProtectedGroup = false;
  }

  const yq = summary.year_quotas;
  const isYearQuotasActive = yq && (yq['1'] > 0 || yq['2'] > 0 || yq['3'] > 0 || yq['4'] > 0);
  const yearCapacity = isYearQuotasActive ? (yq[userGrade] || 0) : summary.capacity;

  let groupCapacityVal = summary.capacity;
  const cleanedBids = filterCleanBids(bids);
  let groupBids = cleanedBids.filter(b => !b.is_user);

  if (isYearQuotasActive && isMajorQuotaActive) {
    groupBids = groupBids.filter(b => {
      const inGrade = b.grade === userGrade;
      if (!inGrade) return false;
      const protectedBid = isBidProtected(b);
      return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
    });
    groupCapacityVal = yearCapacity;
  } else if (isYearQuotasActive) {
    groupBids = groupBids.filter(b => b.grade === userGrade);
    groupCapacityVal = yearCapacity;
  } else if (isMajorQuotaActive) {
    groupBids = groupBids.filter(b => {
      const protectedBid = isBidProtected(b);
      return userBelongsToProtectedGroup ? protectedBid : !protectedBid;
    });
    if (userBelongsToProtectedGroup) {
      groupCapacityVal = mqVal;
    } else {
      groupCapacityVal = Math.max(0, summary.capacity - mqVal);
    }
  }

  let isGroupUnderEnrolled = false;
  if (groupCapacityVal > 0 && groupBids.length <= groupCapacityVal) {
    isGroupUnderEnrolled = true;
  }

  const pred = precomputedCurves && precomputedCurves.curves && precomputedCurves.curves[key] ? precomputedCurves.curves[key] : { median: 12.0 };
  let isUnderEnrolled = isGroupUnderEnrolled || (pred.median <= 1.5);

  if (isUnderEnrolled) {
    return (bid >= 1) ? 0.98 : 0.0;
  }

  const medianVal = calculateGroupSpecificCutoff(c, myProfile);

  if (bid < medianVal) {
    const dist = bid - medianVal;
    let p = 1 / (1 + Math.exp(-2.0 * dist));
    return p < 0.01 ? 0.0 : p;
  }

  let tieBreakerProb = 0.5;
  const bidsAtCutoff = groupBids.filter(b => b.mileage === medianVal);
  if (bidsAtCutoff.length > 0) {
    const passedAtCutoff = bidsAtCutoff.filter(b => b.success === 'Y');
    tieBreakerProb = passedAtCutoff.length / bidsAtCutoff.length;
  }
  tieBreakerProb = Math.min(0.9, Math.max(0.1, tieBreakerProb));

  if (bid === medianVal) {
    return tieBreakerProb;
  }

  const dist = bid - medianVal;
  return tieBreakerProb + (1.0 - tieBreakerProb) * (1 - Math.exp(-1.5 * dist));
}

// Monte Carlo simulation for risk dashboard evaluation (E[Credits], E[Utility], VaR, Plan B)
function runMonteCarloRiskSimulation() {
  if (selectedCourses.length === 0) {
    document.getElementById('risk-dashboard-card').style.display = 'none';
    return;
  }

  console.log("[Monte Carlo] Starting 10,000 runs risk simulation...");

  // 1. Prepare course probability data
  const contentEl = document.getElementById('risk-dashboard-content');
  if (contentEl) {
    contentEl.classList.remove('risk-dashboard-active');
  }

  const coursesEvaluated = selectedCourses.map((c, index) => {
    const bid = c.mileage || 0;
    const prob = getCourseProbability(c, bid);

    const isCore = isCoreScienceCourse(c.code, c.title);
    const isRequired = isCore || (c.classification && (c.classification.includes('필') || c.classification.includes('기초') || c.classification.includes('전기')));
    
    // index-based weighting curve
    let weight = 1.0;
    if (index === 0) weight = isRequired ? 2.5 : 2.0;
    else if (index === 1) weight = isRequired ? 2.0 : 1.7;
    else if (index === 2) weight = isRequired ? 1.5 : 1.3;
    else if (index === 3) weight = isRequired ? 1.0 : 0.9;
    else weight = 0.5;

    return {
      code: c.code,
      division: c.division,
      title: c.title,
      credits: c.credits || 3,
      prob: prob,
      weight: weight,
      isCritical: (index <= 1 || isCore)
    };
  });

  // 2. Perform 10,000 simulation runs
  const nRuns = 10000;
  const creditsRuns = [];
  const utilityRuns = [];
  let jointFailCount = 0;
  
  // Track critical courses
  const criticalCourses = coursesEvaluated.filter(c => c.isCritical);

  for (let r = 0; r < nRuns; r++) {
    let totalCredits = 0;
    let totalUtility = 0;
    let criticalFailCount = 0;

    coursesEvaluated.forEach(c => {
      const isPassed = Math.random() < c.prob;
      if (isPassed) {
        totalCredits += c.credits;
        totalUtility += c.weight; // Utility contribution
      } else {
        if (c.isCritical) {
          criticalFailCount++;
        }
      }
    });

    creditsRuns.push(totalCredits);
    utilityRuns.push(totalUtility);

    // Joint failure: all critical courses fail
    if (criticalCourses.length > 0 && criticalFailCount === criticalCourses.length) {
      jointFailCount++;
    }
  }

  // 3. Compute statistics
  const meanCredits = creditsRuns.reduce((s, x) => s + x, 0) / nRuns;
  const varianceCredits = creditsRuns.reduce((s, x) => s + Math.pow(x - meanCredits, 2), 0) / nRuns;
  const stdCredits = Math.sqrt(varianceCredits);

  const meanUtility = utilityRuns.reduce((s, x) => s + x, 0) / nRuns;

  // VaR (5% percentile)
  utilityRuns.sort((a, b) => a - b);
  const var5Pct = utilityRuns[Math.floor(nRuns * 0.05)];

  const jointFailProb = criticalCourses.length > 0 ? (jointFailCount / nRuns) : 0.0;

  // Credit goal probabilities
  const goalProbabilities = {};
  const targetLevels = [3, 6, 9, 12, 15, 18];
  targetLevels.forEach(lvl => {
    const successCount = creditsRuns.filter(x => x >= lvl).length;
    goalProbabilities[lvl] = successCount / nRuns;
  });

  // 4. Render UI Elements
  document.getElementById('risk-dashboard-card').style.display = 'block';
  document.getElementById('risk-expected-credits').textContent = `${meanCredits.toFixed(1)} ± ${stdCredits.toFixed(1)}`;
  document.getElementById('risk-expected-utility').textContent = meanUtility.toFixed(4);
  document.getElementById('risk-var').textContent = var5Pct.toFixed(1);
  document.getElementById('risk-joint-fail').textContent = `${(jointFailProb * 100).toFixed(2)}%`;

  // Render Goal probability bars
  const probContainer = document.getElementById('risk-probability-bar-container');
  probContainer.innerHTML = '';
  targetLevels.forEach(lvl => {
    const p = goalProbabilities[lvl] || 0.0;
    const barHtml = `
      <div style="flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 6px; border-radius: 4px; text-align: center;">
        <div style="font-size: 10px; color: var(--text-muted);">≥${lvl}학점</div>
        <div style="font-size: 13px; font-weight: 700; color: ${p >= 0.8 ? 'var(--success)' : p >= 0.5 ? 'var(--warning)' : 'var(--danger)'}">${Math.round(p * 100)}%</div>
      </div>
    `;
    probContainer.insertAdjacentHTML('beforeend', barHtml);
  });

  // 5. Plan B Replacement Strategy Recommendations
  const planBList = document.getElementById('risk-plan-b-list');
  planBList.innerHTML = '';

  const highRiskCourses = coursesEvaluated.filter(c => c.prob < 0.90);
  if (highRiskCourses.length === 0) {
    planBList.innerHTML = `
      <div class="suggestion-item success" style="border-left: 3px solid var(--success);">
        <h5>모든 과목 안전권</h5>
        <p style="color: var(--success); font-size: 11px;">현재 분배 상태에서 탈락 위험이 큰 과목이 없습니다.</p>
      </div>
    `;
  } else {
    highRiskCourses.forEach(c => {
      const item = document.createElement('div');
      item.className = 'suggestion-item danger';
      item.style.borderLeft = '3px solid var(--danger)';
      
      // Select mock replacement based on department prefix
      let repText = "";
      if (c.code.startsWith("MAT")) {
        repText = "[1] MAT2202 공학수학 (p=0.88)<br>[2] MAT3106 미분기하학 (p=0.75)";
      } else if (c.code.startsWith("STA")) {
        repText = "[1] STA3101 회귀분석 (p=0.82)<br>[2] STA2201 수리통계학 (p=0.79)";
      } else {
        repText = "[1] BIZ2101 재무관리 (p=0.85)<br>[2] ECO3102 거시경제학 (p=0.80)";
      }

      item.innerHTML = `
        <h5>${c.title} (${c.code}-${c.division}) 탈락 대비</h5>
        <p style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 4px;">
          현재 합격 예측 확률: <strong style="color: var(--danger); font-size: 12.5px;">${Math.round(c.prob * 100)}%</strong> (탈락 위험 노출)
        </p>
        <div style="font-size: 10.5px; color: var(--text-muted); background: rgba(0,0,0,0.15); padding: 6px; border-radius: 4px; line-height: 1.4;">
          <strong>대체 추천 과목 (2차 수강신청용):</strong><br>
          ${repText}
        </div>
      `;
      planBList.appendChild(item);
    });
  }

  // 6. Reveal the dashboard content
  if (contentEl) {
    contentEl.classList.add('risk-dashboard-active');
  }
}

// Asynchronously fetch stats for sibling divisions comparative preview
async function fetchSiblingStats(code, division) {
  try {
    const res = await fetch(`/api/mileage?code=${code}&division=${division}`);
    const data = await res.json();
    const previewEl = document.getElementById(`div-preview-${division}`);
    if (previewEl && data.success) {
      const sum = data.data.summary;
      const ratio = sum.capacity > 0 ? (sum.applicants / sum.capacity).toFixed(2) : '0';
      
      const isPopular = ratio > 1.25 || sum.min_mileage >= 24;
      const badgeHtml = isPopular 
        ? `<span class="div-badge popular">🔥 인기</span>`
        : `<span class="div-badge unpopular">🌱 널널</span>`;
        
      previewEl.innerHTML = `
        <span>경쟁률: <strong>${sum.capacity}/${sum.applicants}명 (${ratio}:1)</strong></span>
        <span style="margin-left:6px;">과거 컷: <strong style="color:var(--warning);">${sum.min_mileage}점</strong></span>
        ${badgeHtml}
      `;
    }
  } catch (err) {
    console.log("Failed to load sibling stats", err);
  }
}

// Dynamically load colleges and populate search filter
async function initSearchFilters() {
  const collegeSelect = document.getElementById('select-college');
  const deptSelect = document.getElementById('select-dept');
  if (!collegeSelect || !deptSelect) return;
  
  collegeSelect.innerHTML = '<option value="">대학 로드 중...</option>';
  deptSelect.innerHTML = '<option value="">학과 로드 중...</option>';
  
  try {
    const res = await fetch('/api/colleges');
    const data = await res.json();
    if (data.success && data.colleges && data.colleges.length > 0) {
      collegeSelect.innerHTML = '<option value="" selected>전체</option>';
      data.colleges.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.name;
        collegeSelect.appendChild(opt);
      });
      await loadDepartments(collegeSelect.value);
    } else {
      throw new Error("Api failed");
    }
  } catch (err) {
    console.log("Colleges load failed, using fallbacks", err);
    collegeSelect.innerHTML = `
      <option value="" selected>전체</option>
      <option value="s1103">이과대학</option>
      <option value="s1102">상경대학</option>
      <option value="s1101">문과대학</option>
    `;
    await loadDepartments(collegeSelect.value);
  }
}

// Dynamically load departments for a college and populate search filter
async function loadDepartments(collegeCode) {
  const deptSelect = document.getElementById('select-dept');
  if (!deptSelect) return;
  
  if (!collegeCode) {
    deptSelect.innerHTML = '<option value="">전체</option>';
    await fetchCourses();
    return;
  }
  
  deptSelect.innerHTML = '<option value="">학과 로드 중...</option>';
  
  try {
    const res = await fetch(`/api/departments?college=${collegeCode}`);
    const data = await res.json();
    if (data.success && data.departments && data.departments.length > 0) {
      deptSelect.innerHTML = '<option value="">전체</option>';
      data.departments.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.code;
        opt.textContent = d.name;
        if (d.code === '0301' || d.code === '0203') opt.selected = true; // Default Math/Stats
        deptSelect.appendChild(opt);
      });
    } else {
      throw new Error("Api failed");
    }
  } catch (err) {
    console.log("Departments load failed, using fallbacks", err);
    if (collegeCode === 's1103') {
      deptSelect.innerHTML = `
        <option value="">전체</option>
        <option value="0301" selected>수학전공</option>
        <option value="0302">물리학전공</option>
        <option value="0303">화학전공</option>
      `;
    } else if (collegeCode === 's1102') {
      deptSelect.innerHTML = `
        <option value="">전체</option>
        <option value="0203" selected>응용통계학전공</option>
      `;
    } else {
      deptSelect.innerHTML = `
        <option value="">전체</option>
        <option value="9999" selected>공통/임의전공</option>
      `;
    }
  }
  
  // Fetch courses after dept select is populated
  await fetchCourses();
}

// Mark Monte Carlo dashboard as outdated (blur it and change button to indicate action is needed)
function markMonteCarloOutdated() {
  const card = document.getElementById('risk-dashboard-card');
  if (!card) return;

  if (selectedCourses.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const content = document.getElementById('risk-dashboard-content');
  const btn = document.getElementById('btn-run-monte-carlo');
  const icon = document.getElementById('icon-monte-carlo');
  const text = document.getElementById('text-monte-carlo');
  
  if (content) {
    content.style.filter = 'blur(3.5px)';
    content.style.opacity = '0.5';
    content.style.pointerEvents = 'none';
  }
  
  if (btn && text && icon) {
    btn.style.background = 'linear-gradient(135deg, var(--warning), #ff6b00)';
    icon.setAttribute('data-lucide', 'refresh-cw');
    text.textContent = '🔄 마일리지 변경 감지: 시뮬레이션 실행 필요';
    if (window.lucide) window.lucide.createIcons();
  }
}

// ─── Wishlist (Star) Helper Functions ──────────────────────────────────────────
function loadWishlist() {
  try {
    const raw = localStorage.getItem('ymu_wishlist');
    wishlist = raw ? JSON.parse(raw) : [];
  } catch {
    wishlist = [];
  }
}

function saveWishlistToStorage() {
  try {
    localStorage.setItem('ymu_wishlist', JSON.stringify(wishlist));
  } catch (err) {
    console.error("Failed to save wishlist:", err);
  }
}

function toggleWishlist(course) {
  const idx = wishlist.findIndex(w => w.code === course.code && w.division === course.division);
  if (idx > -1) {
    wishlist.splice(idx, 1);
  } else {
    wishlist.push(course);
  }
  saveWishlistToStorage();
  
  // Refresh current search result view or wishlist tab dynamically
  if (activeSearchTab === 'search-wishlist') {
    renderWishlist();
  } else {
    // Re-render matching current tab dataset
    fetchCourses();
  }
}

function clearWishlist() {
  if (wishlist.length === 0) return;
  if (confirm("장바구니의 모든 과목을 비우시겠습니까?")) {
    wishlist = [];
    saveWishlistToStorage();
    if (activeSearchTab === 'search-wishlist') {
      renderWishlist();
    } else {
      fetchCourses();
    }
  }
}



// Render Starred wishlist sandbox courses
function renderWishlist() {
  const listContainer = document.getElementById('search-results-list');
  const countLabel = document.getElementById('results-count');
  
  countLabel.textContent = `장바구니 담은 과목 ${wishlist.length}개`;

  if (wishlist.length === 0) {
    listContainer.innerHTML = `
      <div class="list-placeholder">
        <i data-lucide="star"></i>
        <p>장바구니가 비어 있습니다.<br><span style="font-size: 11.5px; color: var(--text-muted); display: block; margin-top: 4px;">일반 검색 후 별표(⭐)를 눌러 관심과목을 모아보세요.</span></p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Use renderCourses internally to build UI
  renderCourses(wishlist);
}

// Open Course Syllabus inside a native browser popup window (avoiding X-Frame-Options sameorigin blocking)
function openSyllabusModal(course) {
  const year = course.year || '2026';
  const semester = course.semester || '20';
  const paramsObj = {
    sysinstDivCd: "H1",
    syy: year,
    smtDivCd: semester,
    subjtnb: course.code,
    corseDvclsNo: course.division
  };
  const base64Params = btoa(JSON.stringify(paramsObj));
  const url = `https://underwood1.yonsei.ac.kr/com/lgin/SsoCtr/initExtPageWork.do?link=sylla&params=${base64Params}`;

  // Open in a standard new browser tab (_blank) instead of custom popup window
  // This bypasses the popup blockers in Chrome/Safari/iOS completely and never prompts warnings!
  window.open(url, '_blank');
}

// Open Course Context Action Modal (Floating Course Card Popup)
function openCourseActionModal(course) {
  const modal = document.getElementById('course-action-modal');
  const container = document.getElementById('action-modal-card-container');
  
  if (!modal || !container) return;

  // Find index of this course in selectedCourses to determine rank badge
  const index = selectedCourses.findIndex(x => x.code === course.code && x.division === course.division);
  const rankColor = index === 0 ? 'var(--danger)' : index === 1 ? 'var(--warning)' : index === 2 ? 'var(--accent-light)' : 'var(--text-secondary)';
  const rankLabel = `${index + 1}순번`;

  const key = `${course.code}-${course.division}`;
  const prob = getCourseProbability(course, course.mileage);
  const color = prob >= 0.8 ? 'var(--success)' : prob >= 0.5 ? 'var(--warning)' : 'var(--danger)';
  const glow = prob >= 0.8 ? 'var(--success-glow)' : prob >= 0.5 ? 'var(--warning-glow)' : 'var(--danger-glow)';
  const maxVal = course.mileageSummary ? (course.mileageSummary.max_allowed_mileage || 36) : 36;

  // Calculate syllabus URL for direct target="_blank" navigation
  const year = course.year || '2026';
  const semester = course.semester || '20';
  const paramsObj = {
    sysinstDivCd: "H1",
    syy: year,
    smtDivCd: semester,
    subjtnb: course.code,
    corseDvclsNo: course.division
  };
  const base64Params = btoa(JSON.stringify(paramsObj));
  const syllabusUrl = `https://underwood1.yonsei.ac.kr/com/lgin/SsoCtr/initExtPageWork.do?link=sylla&params=${base64Params}`;

  // Render the exact same allocation-item card structure inside the modal!
  container.innerHTML = `
    <div class="allocation-item" data-key="${key}" style="margin-bottom: 0; box-shadow: none; border-color: transparent; background: transparent;">
      <div class="drag-handle" style="visibility: hidden; cursor: default;">
        <i data-lucide="grip-vertical" style="width: 14px; height: 14px;"></i>
      </div>
      <div class="rank-badge" style="background: ${rankColor}; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: #fff; text-align: center; width: 45px; display: inline-block;">
        ${rankLabel}
      </div>

      <div class="alloc-info" style="flex: 1;">
        <h4 style="margin: 0; font-size: 13px;">${course.title}</h4>
        <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-secondary);">${course.code}-${course.division} | ${course.professor || '교수 미지정'} | ${course.credits}학점</p>
        <div class="alloc-meta-row" style="display:flex; gap:12px; align-items:center; margin-top:4px;">
          <label class="retake-toggle-label" style="margin-top:0;">
            <input type="checkbox" class="modal-retake-checkbox" ${course.isRetake ? 'checked' : ''}>
            <span>재수강</span>
          </label>
        </div>
      </div>
      <div class="alloc-control-slider" style="flex: 1.5;">
        <input type="range" class="modal-mileage-slider" min="0" max="${maxVal}" value="${course.mileage}">
      </div>
      <div class="alloc-val-box">
        <input type="number" class="modal-mileage-input" min="0" max="${maxVal}" value="${course.mileage}">
      </div>
      <div class="alloc-prob-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:65px; margin-left:6px;">
        <span style="font-size:9px; color:var(--text-muted); margin-bottom:2px;">합격 확률</span>
        <span class="prob-badge" style="font-size:11.5px; font-weight:700; padding:2px 6px; border-radius:4px; color:${color}; background:${glow};">
          ${Math.round(prob * 100)}%
          <div class="tooltip-content" id="modal-tooltip-${course.code}-${course.division}">
            ${getAdvisorSuggestionHTML(course)}
          </div>
        </span>
      </div>
      <a href="${syllabusUrl}" target="_blank" class="btn-selected-syllabus modal-btn-syllabus" title="강의계획서 조회" style="text-decoration: none; color: inherit;">
        <i data-lucide="book-open"></i>
      </a>
      <button class="btn-analyze modal-btn-analyze" title="상세 마일리지 통계 분석" style="margin-left: 4px;">
        <i data-lucide="bar-chart-3"></i>
      </button>
      <button class="btn-remove modal-btn-remove" title="시간표에서 제거" style="margin-left: 4px;">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;

  // Initialize Lucide icons inside the modal
  if (window.lucide) window.lucide.createIcons();

  // Query DOM handles within the modal
  const slider = container.querySelector('.modal-mileage-slider');
  const numberInput = container.querySelector('.modal-mileage-input');
  const syllabusBtn = container.querySelector('.modal-btn-syllabus');
  const analyzeBtn = container.querySelector('.modal-btn-analyze');
  const removeBtn = container.querySelector('.modal-btn-remove');
  const retakeCheckbox = container.querySelector('.modal-retake-checkbox');
  const badge = container.querySelector('.prob-badge');

  // Helper: Live update modal's probability badge
  const updateModalProbBadge = (val) => {
    const p = getCourseProbability(course, val);
    if (badge) {
      badge.innerHTML = `
        ${Math.round(p * 100)}%
        <div class="tooltip-content" id="modal-tooltip-${course.code}-${course.division}">
          ${getAdvisorSuggestionHTML(course)}
        </div>
      `;
      badge.style.color = p >= 0.8 ? 'var(--success)' : p >= 0.5 ? 'var(--warning)' : 'var(--danger)';
      badge.style.background = p >= 0.8 ? 'var(--success-glow)' : p >= 0.5 ? 'var(--warning-glow)' : 'var(--danger-glow)';
    }
  };

  // Sync actions across all UI views (Modal, Tab Card, Calendar block, budget label)
  const syncAllViews = (val) => {
    course.mileage = val;
    updateModalProbBadge(val);

    // 1. Sync Calendar grid block mileage pt text
    const calendarBlocks = document.querySelectorAll('.timetable-event-block');
    calendarBlocks.forEach(block => {
      if (block.querySelector('.event-title') && block.querySelector('.event-title').textContent === course.title) {
        const blockBadge = block.querySelector('.event-mileage-badge');
        if (blockBadge) blockBadge.textContent = `${val}pt`;
      }
    });

    // 2. Sync Right side Mileage Tab card sliders & inputs
    const listCard = document.querySelector(`.allocation-item[data-key="${course.code}-${course.division}"]`);
    if (listCard) {
      const tabSlider = listCard.querySelector('.mileage-slider');
      const tabInput = listCard.querySelector('.mileage-input');
      if (tabSlider) tabSlider.value = val;
      if (tabInput) tabInput.value = val;

      const tabBadge = listCard.querySelector('.prob-badge');
      if (tabBadge) {
        const p = getCourseProbability(course, val);
        tabBadge.innerHTML = `
          ${Math.round(p * 100)}%
          <div class="tooltip-content" id="tooltip-${course.code}-${course.division}">
            ${getAdvisorSuggestionHTML(course)}
          </div>
        `;
        tabBadge.style.color = p >= 0.8 ? 'var(--success)' : p >= 0.5 ? 'var(--warning)' : 'var(--danger)';
        tabBadge.style.background = p >= 0.8 ? 'var(--success-glow)' : p >= 0.5 ? 'var(--warning-glow)' : 'var(--danger-glow)';
      }
    }

    // 3. Update global states
    updateMileageLabel();
    runAdvisorDiagnostic();
    saveDataToStorage();
  };

  // Bind Slider dragging listeners
  if (slider) {
    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value) || 0;
      if (numberInput) numberInput.value = val;
      syncAllViews(val);
    });
  }

  // Bind Number input typing changes
  if (numberInput) {
    numberInput.addEventListener('change', (e) => {
      let val = parseInt(e.target.value) || 0;
      if (val < 0) val = 0;
      if (val > maxVal) val = maxVal;
      e.target.value = val;
      if (slider) slider.value = val;
      syncAllViews(val);
    });
  }

  // Bind Syllabus Button (closes modal when native link opens new tab)
  if (syllabusBtn) {
    syllabusBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  // Bind Statistics Analysis Button
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      openMileageAnalysisModal(course);
    });
  }

  // Bind Course Deletion Button
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      if (confirm(`[${course.code}] ${course.title} 과목을 시간표에서 제거할까요?`)) {
        modal.classList.remove('active');
        removeCourse(course.code, course.division);
      }
    });
  }

  // Bind Retake toggle checkbox inside modal card
  if (retakeCheckbox) {
    retakeCheckbox.addEventListener('change', (e) => {
      course.isRetake = e.target.checked;
      
      // Sync to right mileage tab checkbox
      const listCard = document.querySelector(`.allocation-item[data-key="${course.code}-${course.division}"]`);
      if (listCard) {
        const tabCheck = listCard.querySelector('.retake-checkbox');
        if (tabCheck) tabCheck.checked = e.target.checked;
      }
      
      saveDataToStorage();
      runAdvisorDiagnostic();
      updateModalProbBadge(course.mileage);
    });
  }

  // Show modal overlay
  modal.classList.add('active');
}
