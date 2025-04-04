import { state, MAX_CELL_LENGTH } from './state.js';

/**
 * 推断每列的数据类型
 */
export function detectColumnTypes() {
    // 初始化列类型对象
    state.columnTypes = {};

    // 对每列进行类型检测
    state.columns.forEach(column => {
        // 获取该列的非空值
        const nonNullValues = state.data
            .map(row => row[column])
            .filter(value => value !== null && value !== undefined);

        if (nonNullValues.length === 0) {
            // 如果没有非空值，默认为字符串类型
            state.columnTypes[column] = 'string';
            return;
        }

        // 检查是否所有值都是数字
        const allNumbers = nonNullValues.every(value => {
            const num = Number(value);
            return !isNaN(num) && typeof value !== 'boolean';
        });

        if (allNumbers) {
            // 检查是否有小数点，区分整数和浮点数
            const hasDecimals = nonNullValues.some(value =>
                String(value).includes('.') || !Number.isInteger(Number(value))
            );
            state.columnTypes[column] = hasDecimals ? 'float' : 'integer';
            return;
        }

        // 检查是否所有值都是布尔值
        const allBooleans = nonNullValues.every(value =>
            typeof value === 'boolean' ||
            String(value).toLowerCase() === 'true' ||
            String(value).toLowerCase() === 'false' ||
            value === 1 || value === 0
        );

        if (allBooleans) {
            state.columnTypes[column] = 'boolean';
            return;
        }

        // 检查是否是日期格式
        const datePattern = /^\d{4}[-/](0?[1-9]|1[012])[-/](0?[1-9]|[12][0-9]|3[01])$/;
        const dateTimePattern = /^\d{4}[-/](0?[1-9]|1[012])[-/](0?[1-9]|[12][0-9]|3[01])[\sT]([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?(\.\d+)?(Z|[+-][01][0-9]:[0-5][0-9])?$/;

        const allDates = nonNullValues.every(value =>
            datePattern.test(String(value)) ||
            !isNaN(Date.parse(String(value)))
        );

        if (allDates) {
            // 检查是否有时间部分
            const hasTime = nonNullValues.some(value =>
                dateTimePattern.test(String(value)) ||
                String(value).includes(':')
            );
            state.columnTypes[column] = hasTime ? 'datetime' : 'date';
            return;
        }

        // 默认为字符串类型
        state.columnTypes[column] = 'string';
    });

    console.log('检测到的列类型:', state.columnTypes);
}

/**
 * 根据列类型格式化单元格值
 * @param {any} value - 单元格值
 * @param {string} column - 列名
 * @param {boolean} isFull - 是否显示完整内容
 * @returns {string} 格式化后的值
 */
export function formatCellValue(value, column, isFull = false) {
    if (value === null || value === undefined) {
        return '<span class="null-value">NULL</span>';
    }

    const columnType = state.columnTypes[column];
    let formattedValue;

    // 首先检查是否是对象类型且不是Date对象
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        try {
            formattedValue = JSON.stringify(value, null, isFull ? 2 : 0);
        } catch (e) {
            formattedValue = String(value); // 如果JSON序列化失败，退回到String()
        }
    } else {
        // 根据列类型格式化
        switch (columnType) {
            case 'integer':
            case 'float':
            case 'number':
                formattedValue = String(value);
                break;
            case 'boolean':
                // 对布尔值使用复选框表示
                if (typeof value === 'boolean') {
                    formattedValue = value ? '✓' : '✗';
                } else if (String(value).toLowerCase() === 'true' || value === 1) {
                    formattedValue = '✓';
                } else if (String(value).toLowerCase() === 'false' || value === 0) {
                    formattedValue = '✗';
                } else {
                    formattedValue = String(value);
                }
                break;
            case 'date':
                try {
                    const date = new Date(value);
                    if (!isNaN(date)) {
                        formattedValue = date.toLocaleDateString();
                    } else {
                        formattedValue = String(value);
                    }
                } catch (e) {
                    formattedValue = String(value);
                }
                break;
            case 'datetime':
                try {
                    const date = new Date(value);
                    if (!isNaN(date)) {
                        formattedValue = date.toLocaleString();
                    } else {
                        formattedValue = String(value);
                    }
                } catch (e) {
                    formattedValue = String(value);
                }
                break;
            default:
                formattedValue = String(value);
        }
    }

    // 如果不是展示完整内容且长度超过限制，截断显示
    if (!isFull && formattedValue.length > MAX_CELL_LENGTH) {
        formattedValue = formattedValue.substring(0, MAX_CELL_LENGTH) + '...';
    }

    return formattedValue;
} 