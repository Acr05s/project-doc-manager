# 项目文档管理中心 - 项目总结

## 📋 项目概述

这是一个**完整的、即插即用的Python Web插件**，用于管理项目的全生命周期文档。该插件已按照 DataProcessHub 插件开发规范进行设计和实现。

## ✅ 已完成功能

### 核心功能模块
- ✅ 项目配置加载（从Excel读取）
- ✅ 文档收集和管理系统
- ✅ 实时AJAX文件上传
- ✅ 文件拖拽上传支持
- ✅ 自动签字识别（使用CV/边缘检测）
- ✅ 自动盖章识别（使用颜色分析）
- ✅ 文档版本管理和删除
- ✅ 缺失文档统计
- ✅ 完成进度报告生成
- ✅ 报告导出为HTML

### 新增功能 (v1.1.0)
- ✅ **扩展文档标签**: 支持甲方盖章、乙方盖章、其它盖章标记
- ✅ **文档异常检测**: 根据D列文档要求检查签名/盖章是否缺失，异常时显示警告
- ✅ **批量ZIP导入**: 上传ZIP压缩包，系统自动根据文件名匹配文档归属
- ✅ **文档编辑功能**: 可修改已上传文档的标签信息（签字人、日期、盖章等）
- ✅ **文档覆盖上传**: 支持替换已有文档，刷新资料目录
- ✅ **本地运行**: 自动安装依赖，双击run.bat即可运行

### 前端特性
- ✅ 竖向项目生命周期导航
- ✅ 响应式Web界面
- ✅ 实时通知和加载指示器
- ✅ 模态框文档管理
- ✅ 动态表单和验证
- ✅ 拖拽上传体验

### 后端特性
- ✅ Flask Web框架
- ✅ RESTful API设计
- ✅ 文件管理和存储
- ✅ 错误处理和日志记录
- ✅ 安全验证

## 📁 项目结构

```
project_doc_manager/
├── plugin.json                      ⚙️ 插件配置（必需）
├── main.py                          🐍 Flask后端入口
├── requirements.txt                 📦 Python依赖列表
├── README.md                        📖 使用手册
├── DEPLOYMENT_GUIDE.md              🚀 部署指南
├── generate_sample_requirements.py  🛠️ 生成示例Excel
├── run.bat                          💻 Windows启动脚本
├── run.sh                           🐧 Linux/Mac启动脚本
├── .gitignore                       📝 Git忽略配置
│
├── templates/
│   └── index.html                   🌐 主页面（竖向周期 + 右侧文档）
│
├── static/
│   ├── css/
│   │   └── style.css                🎨 全功能样式（响应式、模态框等）
│   └── js/
│       ├── app.js                   ⚡ 主应用逻辑（核心交互）
│       └── upload.js                📤 上传管理模块
│
└── uploads/                         💾 文件存储目录（自动创建）
```

## 🎯 核心功能详解

### 1. 项目配置加载

**用户行为**:
1. 点击"加载项目配置"
2. 选择Excel文件（示例: `需求清单.xlsx`）
3. 系统自动解析 A列(周期) + C列(文档) + D列(要求)

**后端处理**:
```python
DocumentManager.load_project_config(excel_file)
├─ 读取Excel文件
├─ 提取项目周期和文档结构
└─ 返回嵌套字典结构
```

### 2. 竖向生命周期展示

**前端**:
- 左侧固定面板：项目周期竖向列表
- 可点击切换周期，自动更新右侧内容
- 活跃周期高亮标记

### 3. 文档管理

**右侧内容**:
- 网格卡片展示每个文档类别
- 每个文档可上传多个版本
- 支持拖拽或点击上传

**文档信息记录**:
```
{
  'cycle': '需求阶段',
  'doc_name': '项目建议书',
  'filename': '签署人_时间戳.pdf',
  'signer': '张三',
  'doc_date': '2024-01-15',
  'sign_date': '2024-01-15',
  'detected_signature': True,  # 自动识别
  'detected_seal': False,       # 自动识别
  'file_size': 1024000,
  'upload_time': '2024-01-15T10:30:00'
}
```

### 4. 智能识别系统

#### 签字识别算法:
```
灰度图 → 对比度增强(CLAHE) → Canny边缘检测 
→ 计算边缘像素比例(默认阈值:0.01) → 判定有无签字
```

#### 盖章识别算法:
```
原图 → HSV转换 → 红色范围检测 OR 蓝色范围检测 
→ 计算有色像素比例(默认阈值:0.002) → 判定有无盖章
```

### 5. 缺失文档统计

**实时生成统计**:
```
总周期数 = N
每个周期:
  ├─ 需求文档数
  ├─ 已上传文档数
  ├─ 缺失文档数
  └─ 完成率(%)

总体完成率 = (已上传总数 / 需的总数) * 100%
```

### 6. 报告生成

**报告内容**:
- 📊 总体完成率进度条
- 📈 各周期详细统计
- 📋 缺失文档汇总
- 💾 可导出为HTML文件

## 🚀 快速启动

### Windows用户
```bash
# 双击运行
run.bat
```

### Linux/Mac用户
```bash
chmod +x run.sh
./run.sh
```

### 手动启动
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

访问：`http://localhost:5000`

## 📊 API接口清单

| 方法 | URL | 功能 | 请求 | 响应 |
|------|-----|------|------|------|
| POST | `/api/project/load` | 加载项目 | `file` | `{status, projectConfig}` |
| POST | `/api/documents/upload` | 上传文档 | `FormData` | `{status, docId, metadata}` |
| GET | `/api/documents/list` | 获取文档列表 | `cycle, doc_name` | `{status, data[], total}` |
| DELETE | `/api/documents/<id>` | 删除文档 | - | `{status, message}` |
| POST | `/api/report` | 生成报告 | `projectConfig` | `{status, report}` |

## 📐 技术栈

### 后端
- **Web框架**: Flask 2.3.2
- **数据处理**: pandas 2.0.3, openpyxl 3.1.2
- **图像处理**: OpenCV-Python 4.8.0, Pillow 10.0.0
- **舞字识别**: pytesseract 0.3.10
- **矩阵运算**: NumPy 1.24.3

### 前端
- **HTML5** 语义化结构
- **CSS3** 响应式设计（Flexbox/Grid）
- **Vanilla JavaScript** 异步操作(AJAX/Fetch)
- **模态框系统** 弹窗管理

## 🔧 可自定义配置

在 `plugin.json` 中修改:
```json
{
  "config": {
    "upload_folder": "uploads",
    "max_file_size": 52428800,      // 改为更大或更小
    "allowed_extensions": [...]     // 添加/删除文件类型
  }
}
```

在 `main.py` 中调整:
```python
# 签字检测阈值
has_signature = edge_ratio > 0.01  # 0.01改为0.005~0.02

# 盖章检测阈值
has_seal = color_ratio > 0.002     # 0.002改为0.001~0.005
```

## 🎨 UI/UX特点

### 布局设计
- 🎯 **左侧导航**: 固定宽度200px周期列表
- 📄 **右侧内容**: 自适应网格卡片（280px最小）
- 📱 **响应式**: 平板和手机自动调整为竖向布局

### 交互设计
- ✨ 实时AJAX上传，无页面刷新
- 🎯 拖拽上传支持
- 📬 实时通知反馈
- ⌛ 加载指示器
- 🎨 彩色标签（签字、盖章等）

### 颜色体系
- 主色: #0066cc (蓝色)
- 成功: #28a745 (绿色)
- 危险: #dc3545 (红色)
- 背景: #f5f5f5 (浅灰)

## 📝 依赖包说明

| 包 | 版本 | 用途 |
|--|--|--|
| Flask | 2.3.2 | Web框架 |
| pandas | 2.0.3 | Excel读取 |
| openpyxl | 3.1.2 | Excel支持 |
| opencv-python | 4.8.0.74 | 图像处理和边缘检测 |
| pytesseract | 0.3.10 | OCR识别 |
| Pillow | 10.0.0 | 图像操作 |
| numpy | 1.24.3 | 数值计算 |

## 🔒 安全特性

✅ 文件大小限制（50MB）  
✅ 允许文件类型白名单  
✅ 上传文件隔离存储  
✅ 用户输入验证  
✅ 错误异常处理  
✅ 操作日志记录  

## 📚 文档

- 📖 [README.md](README.md) - 功能说明和使用指南
- 🚀 [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 部署和测试指南
- 🔗 [plugin.json](plugin.json) - 插件配置说明

## 🎯 后续增强方向

### Phase 2
- [ ] 用户认证和权限管理
- [ ] 数据库持久化（替换内存存储）
- [ ] 文档预览功能
- [ ] 批量操作支持

### Phase 3
- [ ] WebSocket实时通知
- [ ] 深度学习签字识别（TensorFlow）
- [ ] 文档版本对比
- [ ] 工作流审批流程

### Phase 4
- [ ] 移动端App
- [ ] 在线协作编辑
- [ ] AI智能分类
- [ ] 多语言支持

## 📞 技术支持

遇到问题？查看：
1. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) 的常见问题部分
2. 应用日志输出
3. 浏览器控制台错误

## ✨ 项目亮点

🌟 **完整实现** - 从需求到部署一应俱全  
🌟 **即插即用** - 按照DataProcessHub标准编写  
🌟 **智能识别** - 自动检测签字和盖章  
🌟 **实时反馈** - AJAX无刷新交互  
🌟 **响应式设计** - 完美适配各种设备  
🌟 **详细文档** - 部署指南和故障排除  

---

**项目版本**: 3.0.3  
**创建日期**: 2024年3月  
**最近更新**: 2026年4月17日  
**许可证**: 开源  
**作者**: 文档管理团队

## 🎁 包含文件清单

- [x] 后端核心 (main.py)
- [x] 前端界面 (index.html + CSS + JS)
- [x] 插件配置 (plugin.json)
- [x] 依赖列表 (requirements.txt)
- [x] 启动脚本 (run.bat, run.sh)
- [x] 样本生成器 (generate_sample_requirements.py)
- [x] 完整文档 (README.md)
- [x] 部署指南 (DEPLOYMENT_GUIDE.md)
- [x] 本总结 (PROJECT_SUMMARY.md)

**总计**: 13个文件，全部已生成！🎉

---

**准备打包为插件？** 将以上所有文件压缩为 `project_doc_manager.zip` 即可上传到 DataProcessHub！
