/**
 * 工具模块 - 提供通用工具函数
 */

/**
 * 格式化日期为月/日
 */
export function formatDateToMonth(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 格式化日期为完整格式
 */
export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * 统一格式化日期时间：yyyy-MM-dd HH:mm:ss（无 T）
 */
export function formatDateTimeDisplay(dateString, timezone = 'Asia/Shanghai') {
    if (!dateString) return '-';
    let dateObj = null;

    if (dateString instanceof Date) {
        dateObj = dateString;
    } else {
        const normalized = String(dateString).replace(' ', 'T');
        dateObj = new Date(normalized);
    }

    if (Number.isNaN(dateObj.getTime())) {
        return String(dateString).replace('T', ' ');
    }

    const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone || 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(dateObj);

    const get = (type) => parts.find(p => p.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * 生成唯一ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 防抖函数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 深拷贝对象
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**
 * 检查对象是否为空
 */
export function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 下载文件
 */
export function downloadFile(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 检查是否为有效的URL
 */
export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * 检查是否为有效的邮箱
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * 检查是否为有效的手机号
 */
export function isValidPhone(phone) {
    const re = /^1[3-9]\d{9}$/;
    return re.test(phone);
}

/**
 * 截断字符串
 */
export function truncateString(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

/**
 * 检查文件类型是否为图片
 */
export function isImageFile(filename) {
    const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const extension = getFileExtension(filename).toLowerCase();
    return extensions.includes(extension);
}

/**
 * 检查文件类型是否为文档
 */
export function isDocumentFile(filename) {
    const extensions = ['doc', 'docx', 'pdf', 'txt', 'md', 'html', 'htm'];
    const extension = getFileExtension(filename).toLowerCase();
    return extensions.includes(extension);
}

/**
 * 检查文件类型是否为表格
 */
export function isSpreadsheetFile(filename) {
    const extensions = ['xls', 'xlsx', 'csv', 'ods'];
    const extension = getFileExtension(filename).toLowerCase();
    return extensions.includes(extension);
}

/**
 * 检查文件类型是否为压缩包
 */
export function isArchiveFile(filename) {
    const extensions = ['zip', 'rar', '7z', 'tar', 'gz'];
    const extension = getFileExtension(filename).toLowerCase();
    return extensions.includes(extension);
}
