/**
 * @deprecated 3.S15 已退役
 *
 * 原依赖旧 REST clueApi（GET /api/v1/clues），已与 BFF 全 POST 规范不符。
 * 替代：直接调用 frontend/services/case.ts 的 listClues / createClue / prepareClueForCase。
 * 无任何组件引用，保留空导出避免 TS 模块解析错误。
 */

export {};
