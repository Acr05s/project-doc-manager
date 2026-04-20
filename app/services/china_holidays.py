"""中国法定节假日与调休日历服务

数据来源: 国务院办公厅每年发布的节假日安排通知 + 在线API自动更新
覆盖范围: 2025-2027 年（可随时扩展，支持在线获取）

使用方法:
    from app.services.china_holidays import is_workday, is_holiday

    is_workday(date(2026, 1, 1))   # False - 元旦
    is_workday(date(2026, 1, 5))   # True  - 周一工作日
    is_holiday(date(2026, 10, 1))  # True  - 国庆节
"""

import json
import logging
import os
from datetime import date, datetime
from pathlib import Path
from typing import Union

logger = logging.getLogger(__name__)

# ============================================================================
# 法定节假日（放假日期）
# 格式: { 年份: { (月, 日), (月, 日), ... } }
# ============================================================================
HOLIDAYS = {
    2025: {
        # 元旦 1.1
        (1, 1),
        # 春节 1.28-2.4 (除夕-初七)
        (1, 28), (1, 29), (1, 30), (1, 31), (2, 1), (2, 2), (2, 3), (2, 4),
        # 清明节 4.4-4.6
        (4, 4), (4, 5), (4, 6),
        # 劳动节 5.1-5.5
        (5, 1), (5, 2), (5, 3), (5, 4), (5, 5),
        # 端午节 5.31-6.2
        (5, 31), (6, 1), (6, 2),
        # 中秋节+国庆节 10.1-10.8
        (10, 1), (10, 2), (10, 3), (10, 4), (10, 5), (10, 6), (10, 7), (10, 8),
    },
    2026: {
        # 元旦 1.1-1.3
        (1, 1), (1, 2), (1, 3),
        # 春节 2.17-2.23 (除夕到初六)
        (2, 17), (2, 18), (2, 19), (2, 20), (2, 21), (2, 22), (2, 23),
        # 清明节 4.4-4.6
        (4, 4), (4, 5), (4, 6),
        # 劳动节 5.1-5.5
        (5, 1), (5, 2), (5, 3), (5, 4), (5, 5),
        # 端午节 6.19-6.21
        (6, 19), (6, 20), (6, 21),
        # 中秋节 9.25-9.27
        (9, 25), (9, 26), (9, 27),
        # 国庆节 10.1-10.8
        (10, 1), (10, 2), (10, 3), (10, 4), (10, 5), (10, 6), (10, 7), (10, 8),
    },
    2027: {
        # 元旦 1.1-1.3
        (1, 1), (1, 2), (1, 3),
        # 春节 2.6-2.12
        (2, 6), (2, 7), (2, 8), (2, 9), (2, 10), (2, 11), (2, 12),
        # 清明节 4.3-4.5
        (4, 3), (4, 4), (4, 5),
        # 劳动节 5.1-5.5
        (5, 1), (5, 2), (5, 3), (5, 4), (5, 5),
        # 端午节 6.9-6.11
        (6, 9), (6, 10), (6, 11),
        # 中秋节 9.15-9.17
        (9, 15), (9, 16), (9, 17),
        # 国庆节 10.1-10.7
        (10, 1), (10, 2), (10, 3), (10, 4), (10, 5), (10, 6), (10, 7),
    },
}

# ============================================================================
# 调休工作日（周末上班的日期）
# 格式: { 年份: { (月, 日), ... } }
# ============================================================================
WORKDAY_SHIFTS = {
    2025: {
        # 春节调休
        (1, 26),  # 周日上班
        (2, 8),   # 周六上班
        # 劳动节调休
        (4, 27),  # 周日上班
        # 国庆节调休
        (9, 28),  # 周日上班
        (10, 11), # 周六上班
    },
    2026: {
        # 春节调休
        (2, 15),  # 周日上班
        (2, 28),  # 周六上班
        # 劳动节调休
        (4, 26),  # 周日上班
        # 国庆节调休
        (9, 27),  # 周日上班 (与中秋连休有关)
        (10, 10), # 周六上班
    },
    2027: {
        # 春节调休
        (2, 14),  # 周日上班
        (2, 20),  # 周六上班
        # 劳动节调休
        (4, 25),  # 周日上班
        # 国庆节调休
        (9, 26),  # 周日上班
        (10, 9),  # 周六上班
    },
}


def _normalize_date(d: Union[date, datetime, str]) -> date:
    """将输入统一转为 date 对象"""
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    if isinstance(d, str):
        return datetime.strptime(d.strip()[:10], '%Y-%m-%d').date()
    raise TypeError(f'不支持的日期类型: {type(d)}')


def is_holiday(d: Union[date, datetime, str]) -> bool:
    """判断指定日期是否为法定节假日（放假日）

    Args:
        d: 日期对象、datetime 或 'YYYY-MM-DD' 字符串

    Returns:
        True 如果是法定节假日（放假）
    """
    dt = _normalize_date(d)
    effective = _get_effective_holidays(dt.year)
    return (dt.month, dt.day) in effective


def is_workday_shift(d: Union[date, datetime, str]) -> bool:
    """判断指定日期是否为调休工作日（周末补班）

    Args:
        d: 日期对象、datetime 或 'YYYY-MM-DD' 字符串

    Returns:
        True 如果是调休上班日
    """
    dt = _normalize_date(d)
    effective = _get_effective_shifts(dt.year)
    return (dt.month, dt.day) in effective


def is_workday(d: Union[date, datetime, str]) -> bool:
    """判断指定日期是否为工作日

    规则:
        1. 法定节假日 → 非工作日
        2. 调休工作日（周末补班） → 工作日
        3. 周六/周日 → 非工作日
        4. 周一~周五 → 工作日
        5. 如果年份不在数据范围内，按普通周一~周五判断

    Args:
        d: 日期对象、datetime 或 'YYYY-MM-DD' 字符串

    Returns:
        True 如果是工作日
    """
    dt = _normalize_date(d)

    # 法定节假日一定不是工作日
    if is_holiday(dt):
        return False

    # 调休工作日（周末补班）一定是工作日
    if is_workday_shift(dt):
        return True

    # 按星期判断: 0=Monday ... 6=Sunday
    return dt.weekday() < 5


def get_holiday_name(d: Union[date, datetime, str]) -> str:
    """获取节假日名称（如果是节假日的话）

    Returns:
        节假日名称，非节假日返回空字符串
    """
    dt = _normalize_date(d)
    if not is_holiday(dt):
        return ''

    month, day = dt.month, dt.day

    # 简单的名称匹配
    if month == 1 and day <= 3:
        return '元旦'
    if dt.year in HOLIDAYS:
        # 春节判断：1-2月的大段假期
        spring_dates = [(m, d_) for (m, d_) in HOLIDAYS[dt.year]
                        if m in (1, 2) and not (m == 1 and d_ <= 3)]
        if (month, day) in spring_dates:
            return '春节'
    if month == 4 and day <= 6:
        return '清明节'
    if month == 5 and day <= 5:
        return '劳动节'
    if month in (5, 6) and not (month == 5 and day <= 5):
        return '端午节'
    if month == 9 and 15 <= day <= 27:
        return '中秋节'
    if month == 10:
        return '国庆节'

    return '法定节假日'


# ============================================================================
# 在线数据持久化 & API获取
# ============================================================================

# 本地缓存文件路径
_CACHE_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent.parent / 'data'
_CACHE_FILE = _CACHE_DIR / 'china_holidays_cache.json'

# 运行时覆盖数据（从缓存文件加载）
_RUNTIME_HOLIDAYS = {}
_RUNTIME_WORKDAY_SHIFTS = {}
_cache_loaded = False


def _load_cache():
    """从本地缓存文件加载节假日数据。"""
    global _RUNTIME_HOLIDAYS, _RUNTIME_WORKDAY_SHIFTS, _cache_loaded
    if _cache_loaded:
        return
    _cache_loaded = True
    if not _CACHE_FILE.exists():
        return
    try:
        with open(_CACHE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for year_str, dates in data.get('holidays', {}).items():
            year = int(year_str)
            _RUNTIME_HOLIDAYS[year] = {(d[0], d[1]) for d in dates}
        for year_str, dates in data.get('workday_shifts', {}).items():
            year = int(year_str)
            _RUNTIME_WORKDAY_SHIFTS[year] = {(d[0], d[1]) for d in dates}
        logger.info(f'[ChinaHolidays] 从缓存加载节假日数据: {list(_RUNTIME_HOLIDAYS.keys())}')
    except Exception as e:
        logger.warning(f'[ChinaHolidays] 加载缓存失败: {e}')


def _save_cache():
    """将运行时数据保存到本地缓存文件。"""
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    data = {
        'holidays': {},
        'workday_shifts': {},
        'updated_at': datetime.now().isoformat(),
    }
    # 合并硬编码数据和运行时数据
    all_holidays = dict(HOLIDAYS)
    all_holidays.update(_RUNTIME_HOLIDAYS)
    all_shifts = dict(WORKDAY_SHIFTS)
    all_shifts.update(_RUNTIME_WORKDAY_SHIFTS)
    for year, dates in all_holidays.items():
        data['holidays'][str(year)] = sorted(list(dates))
    for year, dates in all_shifts.items():
        data['workday_shifts'][str(year)] = sorted(list(dates))
    with open(_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f'[ChinaHolidays] 节假日数据已保存到缓存')


def _get_effective_holidays(year):
    """获取有效的节假日集合（合并硬编码+运行时数据）"""
    _load_cache()
    result = set()
    if year in HOLIDAYS:
        result.update(HOLIDAYS[year])
    if year in _RUNTIME_HOLIDAYS:
        result.update(_RUNTIME_HOLIDAYS[year])
    return result


def _get_effective_shifts(year):
    """获取有效的调休工作日集合（合并硬编码+运行时数据）"""
    _load_cache()
    result = set()
    if year in WORKDAY_SHIFTS:
        result.update(WORKDAY_SHIFTS[year])
    if year in _RUNTIME_WORKDAY_SHIFTS:
        result.update(_RUNTIME_WORKDAY_SHIFTS[year])
    return result


def fetch_holidays_from_api(year=None):
    """从在线API获取中国节假日数据。

    使用 timor.tech 免费API (无需认证)。
    返回: {'status': 'success/error', 'message': str, 'year': int}
    """
    import urllib.request
    import urllib.error

    if year is None:
        year = datetime.now().year

    url = f'https://timor.tech/api/holiday/year/{year}'
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode('utf-8')
            data = json.loads(raw)

        if data.get('code') != 0:
            return {'status': 'error', 'message': f'API返回错误: {data.get("code")}'}

        holiday_info = data.get('holiday', {})
        holidays_set = set()
        shifts_set = set()

        for date_str, info in holiday_info.items():
            # date_str 格式: "01-01" 或 "MM-DD"
            parts = date_str.split('-')
            if len(parts) == 2:
                month = int(parts[0])
                day = int(parts[1])
                is_off = info.get('holiday', False)  # True=放假, False=调休上班
                if is_off:
                    holidays_set.add((month, day))
                else:
                    shifts_set.add((month, day))

        global _RUNTIME_HOLIDAYS, _RUNTIME_WORKDAY_SHIFTS
        _RUNTIME_HOLIDAYS[year] = holidays_set
        _RUNTIME_WORKDAY_SHIFTS[year] = shifts_set
        _save_cache()

        return {
            'status': 'success',
            'message': f'{year}年节假日数据已更新: {len(holidays_set)}个假日, {len(shifts_set)}个调休日',
            'year': year,
            'holidays_count': len(holidays_set),
            'shifts_count': len(shifts_set),
        }
    except urllib.error.URLError as e:
        return {'status': 'error', 'message': f'网络请求失败: {e}'}
    except Exception as e:
        return {'status': 'error', 'message': f'获取节假日数据失败: {e}'}


def get_holiday_status():
    """获取当前节假日数据状态。"""
    _load_cache()
    all_years = sorted(set(list(HOLIDAYS.keys()) + list(_RUNTIME_HOLIDAYS.keys())))
    info = {}
    for year in all_years:
        src = 'builtin'
        if year in _RUNTIME_HOLIDAYS:
            src = 'online+builtin' if year in HOLIDAYS else 'online'
        h_count = len(_get_effective_holidays(year))
        s_count = len(_get_effective_shifts(year))
        info[year] = {'source': src, 'holidays': h_count, 'shifts': s_count}
    cache_time = ''
    if _CACHE_FILE.exists():
        try:
            with open(_CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            cache_time = cache_data.get('updated_at', '')
        except Exception:
            pass
    return {'years': info, 'cache_updated_at': cache_time}
