import { appState } from './app-state.js';
import { showLoading, showNotification } from './ui.js';

function getFrequencyValue() {
    const selected = document.querySelector('input[name="scheduledFrequency"]:checked');
    return selected ? selected.value : 'weekly';
}

function toggleFrequencyFields() {
    const frequency = getFrequencyValue();
    const weekWrap = document.getElementById('scheduledWeekdayWrap');
    const monthWrap = document.getElementById('scheduledMonthdayWrap');
    if (weekWrap) {
        weekWrap.style.display = frequency === 'weekly' ? 'block' : 'none';
    }
    if (monthWrap) {
        monthWrap.style.display = frequency === 'monthly' ? 'block' : 'none';
    }
}

export async function openScheduledReportModal() {
    const projectId = appState.currentProjectId;
    if (!projectId) {
        showNotification('请先选择项目', 'error');
        return;
    }

    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${projectId}/report-schedule`);
        const result = await resp.json();
        if (result.status !== 'success') {
            showNotification(result.message || '加载定时报告配置失败', 'error');
            return;
        }

        const data = result.data || {};
        document.getElementById('scheduledReportProjectId').value = projectId;
        document.getElementById('scheduledReportEnabled').checked = !!data.enabled;
        document.getElementById('scheduledSendTime').value = data.send_time || '09:00';
        document.getElementById('scheduledWeekday').value = String(data.weekday || 1);
        document.getElementById('scheduledDayOfMonth').value = String(data.day_of_month || 1);
        document.getElementById('scheduledIncludePdf').checked = data.include_pdf !== false;
        document.getElementById('scheduledExternalEmails').value = (data.external_emails || []).join(', ');

        const frequency = data.frequency || 'weekly';
        const radio = document.querySelector(`input[name="scheduledFrequency"][value="${frequency}"]`);
        if (radio) {
            radio.checked = true;
        }
        toggleFrequencyFields();

        const modal = document.getElementById('scheduledReportModal');
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.error('加载定时报告配置失败:', e);
        showNotification('加载定时报告配置失败', 'error');
    } finally {
        showLoading(false);
    }
}

export function closeScheduledReportModal() {
    const modal = document.getElementById('scheduledReportModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function saveScheduledReportConfig(e) {
    e.preventDefault();
    const projectId = document.getElementById('scheduledReportProjectId').value;
    if (!projectId) {
        showNotification('项目ID无效', 'error');
        return;
    }

    const frequency = getFrequencyValue();
    const payload = {
        enabled: document.getElementById('scheduledReportEnabled').checked,
        frequency,
        send_time: document.getElementById('scheduledSendTime').value || '09:00',
        weekday: Number(document.getElementById('scheduledWeekday').value || 1),
        day_of_month: Number(document.getElementById('scheduledDayOfMonth').value || 1),
        include_pdf: document.getElementById('scheduledIncludePdf').checked,
        external_emails: (document.getElementById('scheduledExternalEmails').value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    };

    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${projectId}/report-schedule`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();
        if (result.status === 'success') {
            showNotification('定时报告配置已保存', 'success');
            closeScheduledReportModal();
        } else {
            showNotification(result.message || '保存失败', 'error');
        }
    } catch (e) {
        console.error('保存定时报告失败:', e);
        showNotification('保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function runScheduledReportNow() {
    const projectId = document.getElementById('scheduledReportProjectId').value || appState.currentProjectId;
    if (!projectId) {
        showNotification('请先选择项目', 'error');
        return;
    }

    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${projectId}/report-schedule/run`, { method: 'POST' });
        const result = await resp.json();
        if (result.status === 'success') {
            showNotification(result.message || '报告发送成功', 'success');
        } else {
            showNotification(result.message || '发送失败', 'error');
        }
    } catch (e) {
        console.error('立即发送报告失败:', e);
        showNotification('发送失败', 'error');
    } finally {
        showLoading(false);
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target && target.name === 'scheduledFrequency') {
            toggleFrequencyFields();
        }
    });
}
