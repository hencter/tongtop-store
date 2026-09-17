//! winget 封装层：进程调用、输出解码、表格解析。
//!
//! 分层纪律（对齐 mimenote 的 mn-core 思路）：
//! - `table` / `process` 中的函数不依赖 `tauri`，可独立单测；
//! - 所有"把 winget 的人类可读输出变成结构化数据"的判据只有这里一份，
//!   IPC 命令（lib.rs）只做参数组装与状态管理。

pub mod process;
pub mod table;
