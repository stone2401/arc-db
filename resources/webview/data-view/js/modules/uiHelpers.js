import { state, getVsCodeApi } from './state.js';
import { formatCellValue } from './typeDetector.js';

/**
 * 显示复制提示
 * @param {HTMLElement} element - 复制内容所在的元素
 */
export function showCopyHint(element) {
    const hint = document.getElementById('copy-hint');
    const rect = element.getBoundingClientRect();

    // 计算提示位置
    hint.style.top = `${rect.top - 30}px`;
    hint.style.left = `${rect.left + (rect.width / 2) - 60}px`;

    // 显示提示
    hint.classList.add('visible');

    // 设置定时器隐藏提示
    setTimeout(() => {
        hint.classList.remove('visible');
    }, 1500);
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 */
export function copyToClipboard(text) {
    // 使用vscode API进行复制
    getVsCodeApi().postMessage({
        command: 'copyToClipboard',
        text: text
    });

    // 记录最后复制时间
    state.lastCopyTime = Date.now();
}

/**
 * 显示单元格完整内容
 * @param {HTMLElement} td - 单元格元素
 * @param {any} content - 单元格内容
 * @param {string} column - 列名
 */
export function showCellContent(td, content, column) {
    const tooltip = document.getElementById('content-tooltip');

    // 格式化内容（完整内容）
    const formattedContent = formatCellValue(content, column, true);

    // 清空现有内容
    tooltip.innerHTML = '';

    // 如果内容是对象且已经被JSON格式化，使用pre标签保持格式
    if (typeof content === 'object' && content !== null) {
        const pre = document.createElement('pre');
        pre.textContent = formattedContent;
        tooltip.appendChild(pre);
    } else {
        tooltip.textContent = formattedContent;
    }

    // 获取单元格位置
    const rect = td.getBoundingClientRect();

    // 计算位置 - 尽量显示在单元格下方
    const left = rect.left;
    const top = rect.bottom + 5; // 单元格下方偏移5px

    // 设置位置
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    // 显示工具提示
    tooltip.style.display = 'block';

    // 点击其他区域隐藏
    document.addEventListener('click', function hideTooltip(e) {
        if (e.target !== td && e.target !== tooltip) {
            tooltip.style.display = 'none';
            document.removeEventListener('click', hideTooltip);
        }
    });
}

/**
 * 初始化过滤列下拉菜单
 */
export function initializeFilterColumns() {
    const filterColumn = document.getElementById('filter-column');
    filterColumn.innerHTML = '<option value="">选择列</option>';

    state.columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        filterColumn.appendChild(option);
    });
} 