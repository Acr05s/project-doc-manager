# 修改记录

## 2026-03-26

### 1. 文档打包序号规则修复

**问题描述**：
打包后子目录内的文件序号格式错误，使用了子目录索引（1,2,3...）而非全局序号，导致格式为 `3.1.1` 而非预期的 `3.3.1`。

**修复文件**：
- `app/services/task_service.py` 第 602-607 行

**具体修改**：
```python
# 修改前
file_index_prefix = f"{cycle_idx}.{doc_type_seq}.{subdir_idx}.{inner_seq}"
archive_dir = f"{project_name}/{cycle_idx}.{clean_cycle}/{cycle_idx}.{doc_type_seq} {doc_name}/{cycle_idx}.{doc_type_seq}.{subdir_idx} {clean_dir}"

# 修改后  
file_index_prefix = f"{cycle_idx}.{doc_type_seq}.{global_seq}.{inner_seq}"
archive_dir = f"{project_name}/{cycle_idx}.{clean_cycle}/{cycle_idx}.{doc_type_seq} {doc_name}/{cycle_idx}.{doc_type_seq}.{global_seq} {clean_dir}"
```

**效果**：
```
3.项目准备/
├── 3.1 中标通知书.pdf         ← 文件序号1
├── 3.2 招标文件.doc           ← 文件序号2  
├── 3.3 大唐南京发电厂/        ← 子目录占序号3
│   ├── 3.3.3.1 合同书.pdf     ← 继承序号3
│   └── 3.3.3.2 协议.pdf       ← 继承序号3
└── 3.4 大丰风电/              ← 子目录占序号4
    └── 3.3.4.1 合同书.pdf     ← 继承序号4
```

**规则说明**：
- 每个文档类型级别维护一个全局计数器
- 文件和子目录一起参与编号（1, 2, 3, 4...）
- 无子目录的文件：`周期.文档类型.全局序号`（如 `3.3.1`）
- 子目录内的文件：`周期.文档类型.父目录序号.内部序号`（如 `3.3.3.1`）

---

### 2. 文档需求编辑器 - 属性面板布局调整

**问题描述**：
属性面板宽度不足，自定义属性需要更合理的位置展示。

**修改文件**：
| 文件 | 修改内容 |
|------|----------|
| `static/css/style.css` | 面板宽度 280px → 380px |
| `templates/index.html` | 添加自定义属性区块 |
| `static/js/modules/tree-editor.js` | 渲染自定义属性列表 |

**具体修改**：
1. `.attribute-panel` 宽度从 280px 增加到 380px
2. 新增自定义属性独立区块，包含添加按钮
3. 支持三种属性类型：复选框(☑️)、文本(📝)、日期(📅)

**效果**：
- 属性面板更宽，内容显示更完整
- 自定义属性独立分组展示
- 可动态添加/删除自定义属性
