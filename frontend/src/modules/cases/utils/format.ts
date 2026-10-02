export const formatCurrency = (val: number) => {
    if (val >= 100000000) return `¥${(val / 100000000).toFixed(2)}亿`;
    if (val >= 10000) return `¥${(val / 10000).toFixed(2)}万`;
    return `¥${val.toLocaleString()}`;
};
