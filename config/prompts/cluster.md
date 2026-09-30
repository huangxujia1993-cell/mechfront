# 聚簇提示词（Cluster）

判断新资料与候选事件是不是**同一件事**。

## 三种结论
1. `same_event`：同一件事的不同报道 → 并入该事件
2. `follow_up`：该事件的后续进展（新版本、财报、量产节点）→ 挂到事件时间线
3. `different`：两件独立的事 → 新建事件

## 判断要点
- 同一主体 + 同一发布/事件 = same_event，即使媒体措辞差异很大
- 同一主体但不同产品线 = different（Fusion 的 AI 功能 ≠ Forma 的 AI 功能）
- 拿不准时先给 `same_event`，再换一家模型复核；两票不同则拆开（宁可多建事件，不可错误合并）
- 人工改过的归属（manual_override）永远不被覆盖

## 输出
JSON：`{"relation": "same_event|follow_up|different", "confidence": 0-1, "why": "一句话"}`
