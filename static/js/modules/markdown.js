function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function applyInlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function flushList(buffer, listType, htmlParts) {
    if (!buffer.length) return;
    htmlParts.push(`<${listType}>${buffer.join('')}</${listType}>`);
    buffer.length = 0;
}

export function renderSimpleMarkdown(markdownText) {
    const source = String(markdownText || '').replace(/\r\n/g, '\n');
    if (!source.trim()) {
        return '<p class="markdown-empty">暂无内容</p>';
    }

    const lines = source.split('\n');
    const htmlParts = [];
    const listBuffer = [];
    let listType = null;
    let inCodeBlock = false;
    let codeLines = [];

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            flushList(listBuffer, listType, htmlParts);
            listType = null;
            if (inCodeBlock) {
                htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                codeLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(rawLine);
            continue;
        }

        if (!trimmed) {
            flushList(listBuffer, listType, htmlParts);
            listType = null;
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushList(listBuffer, listType, htmlParts);
            listType = null;
            const level = headingMatch[1].length;
            htmlParts.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
        }

        const quoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (quoteMatch) {
            flushList(listBuffer, listType, htmlParts);
            listType = null;
            htmlParts.push(`<blockquote>${applyInlineMarkdown(quoteMatch[1])}</blockquote>`);
            continue;
        }

        const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unorderedMatch) {
            if (listType && listType !== 'ul') {
                flushList(listBuffer, listType, htmlParts);
            }
            listType = 'ul';
            listBuffer.push(`<li>${applyInlineMarkdown(unorderedMatch[1])}</li>`);
            continue;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
            if (listType && listType !== 'ol') {
                flushList(listBuffer, listType, htmlParts);
            }
            listType = 'ol';
            listBuffer.push(`<li>${applyInlineMarkdown(orderedMatch[1])}</li>`);
            continue;
        }

        flushList(listBuffer, listType, htmlParts);
        listType = null;
        htmlParts.push(`<p>${applyInlineMarkdown(trimmed).replace(/  $/, '<br>')}</p>`);
    }

    flushList(listBuffer, listType, htmlParts);
    if (inCodeBlock) {
        htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    return htmlParts.join('');
}

export function stripMarkdown(markdownText) {
    return String(markdownText || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_>#-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}