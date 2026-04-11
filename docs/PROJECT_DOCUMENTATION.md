# 项目文档管理中心 - 技术文档

## 目录
1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [目录结构](#3-目录结构)
4. [数据存储结构](#4-数据存储结构)
5. [后端模块详解](#5-后端模块详解)
6. [前端模块详解](#6-前端模块详解)
7. [API接口文档](#7-api接口文档)
8. [调用关系图](#8-调用关系图)

---

## 1. 项目概述

**项目名称**: 项目文档管理中心  
**版本**: v2.6.0  
**技术栈**: Flask + Vanilla JavaScript + JSON文件存储  
**设计模式**: 组合模式 (Composite Pattern)

### 核心功能
- 📁 项目全生命周期文档管理（立项→验收）
- 📤 ZIP批量导入和智能匹配
- 🔍 自动签字检测（OpenCV边缘检测）
- 🔍 自动盖章识别（颜色分析算法）
- 📊 文档完成度统计和报告生成
- 📦 项目打包导出
- 🧹 重复文档清理

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (Frontend)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  index   │ │document  │ │  cycle   │ │ project  │  │
│  │   .js    │ │   .js    │ │   .js    │ │   .js    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                          │                               │
│                    app-state.js                         │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP API
┌──────────────────────────┼──────────────────────────────┐
│                     后端 (Backend)                      │
│                          │                               │
│  ┌───────────────────────┴───────────────────────┐      │
│  │              Flask Application                │      │
│  │                   (main.py)                   │      │
│  └───────────────────────┬───────────────────────┘      │
│                          │                               │
│  ┌───────────────────────┼───────────────────────┐      │
│  │     Blueprints        │      Utils            │      │
│  │  ┌───────────────┐   │   ┌───────────────┐   │      │
│  │  │ /api/projects │   │   │DocumentManager│   │      │
│  │  │ /api/documents│◄──┼──►│  (组合模式)    │   │      │
│  │  │ /api/tasks    │   │   └───────┬───────┘   │      │
│  │  └───────────────┘   │           │           │      │
│  └───────────────────────┘    ┌─────┴─────┐      │      │
│                               │ 子模块集合  │      │      │
│                               └───────────┘      │      │
└─────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                   数据存储 (Storage)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  projects/   │  │   uploads/   │  │  documents   │ │
│  │  JSON配置    │  │   文件存储    │  │   索引文件    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 模块化设计

后端采用**组合模式**，`DocumentManager`作为主类组合所有子模块：

```python
class DocumentManager:
    def __init__(self, config):
        self.cache = CacheManager(config)           # 缓存管理
        self.logger = OperationLogger(config)       # 操作日志
        self.folders = FolderManager(config)        # 文件夹管理
        self.naming = DocumentNamer(config)         # 文档命名
        self.projects = ProjectManager(config)      # 项目管理
        self.analyzer = ImageAnalyzer(config)       # 图像分析（签字/盖章）
        self.uploader = DocumentUploader(config)    # 文档上传
        self.data_manager = ProjectDataManager(config)  # 数据管理
```

---

## 3. 目录结构

```
project_doc_manager/
├── main.py                          # Flask应用入口
├── requirements.txt                 # Python依赖
├── Version.txt                      # 版本信息
│
├── app/                             # 应用核心代码
│   ├── __init__.py
│   ├── plugins/                     # 插件接口
│   │   └── __init__.py              # create_plugin / process接口
│   │
│   ├── routes/                      # 路由模块（按功能分组）
│   │   ├── main_routes.py           # 主页、配置加载
│   │   ├── swagger_routes.py        # API文档
│   │   ├── task_routes.py           # 异步任务
│   │   ├── documents/               # 文档管理路由
│   │   │   ├── __init__.py          # 蓝图注册
│   │   │   ├── upload.py            # 文件上传（普通/分片）
│   │   │   ├── list.py              # 文档列表、单文档查询
│   │   │   ├── preview.py           # 文档预览（PDF转换）
│   │   │   ├── download.py          # 下载文档
│   │   │   ├── delete.py            # 删除文档
│   │   │   ├── recognize.py         # 智能识别（签字/盖章）
│   │   │   ├── cleanup.py           # 清理重复文档
│   │   │   ├── zip.py               # ZIP包处理
│   │   │   └── files.py             # 文件搜索
│   │   │
│   │   └── projects/                # 项目管理路由
│   │       ├── __init__.py          # 蓝图注册
│   │       ├── basic.py             # 项目CRUD
│   │       ├── requirements.py      # 需求配置加载
│   │       ├── export.py            # 导出/导入/打包
│   │       ├── versions.py          # 版本管理
│   │       └── recycle.py           # 回收站
│   │
│   ├── services/                    # 业务服务层
│   │   └── task_service.py          # 异步任务服务
│   │
│   └── utils/                       # 工具模块（核心）
│       ├── document_manager.py      # 主管理器（组合模式）
│       ├── base.py                  # 基础配置类
│       ├── cache_manager.py         # 缓存管理
│       ├── operation_logger.py      # 操作日志
│       ├── doc_naming.py            # 文档命名规则
│       ├── folder_manager.py        # 文件夹管理
│       ├── document_list.py         # 文档清单
│       ├── archive_manager.py       # 归档管理
│       ├── export_manager.py        # 导出管理
│       ├── requirements_loader.py   # 需求加载
│       ├── project_manager.py       # 项目管理
│       ├── project_data_manager.py  # 项目数据管理
│       ├── image_analyzer.py        # 图像分析（签字/盖章检测）
│       ├── document_uploader.py     # 文档上传处理
│       └── zip_matcher.py           # ZIP智能匹配
│
├── templates/                       # HTML模板
│   └── index.html                   # 主页面（单页应用）
│
├── static/                          # 静态资源
│   ├── css/
│   │   └── style.css                # 样式表
│   └── js/
│       ├── main.js                  # 入口脚本
│       └── modules/                 # ES6模块
│           ├── index.js             # 模块索引/初始化
│           ├── api.js               # API调用封装
│           ├── app-state.js         # 全局状态管理
│           ├── document.js          # 文档操作
│           ├── project.js           # 项目管理
│           ├── cycle.js             # 周期管理
│           ├── zip.js               # ZIP上传处理
│           ├── report.js            # 报告生成
│           ├── ui.js                # UI组件
│           └── utils.js             # 工具函数
│
├── projects/                        # 项目数据存储（运行时创建）
│   ├── projects_index.json          # 项目索引
│   └── {project_name}/              # 各项目目录
│       ├── project_config.json      # 项目配置
│       ├── project_info.json        # 项目信息
│       ├── data/
│       │   ├── documents_index.json     # 文档索引
│       │   └── documents_archived.json  # 归档文档
│       └── versions/                # 版本备份
│
├── uploads/                         # 上传文件存储
│   ├── temp_chunks/                 # 分片上传临时文件
│   └── tasks/                       # 任务状态文件
│
└── tools/                           # 工具代码
    ├── diagnostics/                 # 诊断工具
    ├── cleanup/                     # 清理工具
    ├── fix/                         # 修复工具
    └── test/                        # 测试工具
```

---

## 4. 数据存储结构

### 4.1 项目索引 (projects/projects_index.json)

```json
{
  "updated_time": "2026-03-29T13:36:20.999911",
  "project_20260327133326": {
    "id": "project_20260327133326",
    "name": "示例项目",
    "description": "",
    "created_time": "2026-03-27T13:33:26.990228",
    "updated_time": "2026-03-29T13:21:20.904930",
    "locked": true,
    "session_id": "sess_xxx",
    "session_expire": "2026-03-29T13:41:20.998367"
  },
  "deleted_projects": {}
}
```

### 4.2 项目配置 (projects/{project}/project_config.json)

```json
{
  "id": "project_20260327133326",
  "name": "示例项目",
  "description": "",
  "party_a": "甲方单位",
  "party_b": "乙方单位",
  "supervisor": "监理单位",
  "manager": "管理单位",
  "duration": "YYYY-MM-DD 至 YYYY-MM-DD",
  "created_time": "2026-03-27T13:33:26.990228",
  "updated_time": "2026-03-29T13:21:20.904930",
  "cycles": ["阶段一", "阶段二", "阶段三", "阶段四", "阶段五"],
  "documents": {
    "阶段一": {
      "required_docs": [
        {
          "name": "示例文档",
          "requirement": "签字要求示例",
          "attributes": ["签字人一", "签字人二"]
        }
      ],
      "uploaded_docs": [
        {
          "doc_id": "项目立项_项目立项申请书_20260327_133733_0",
          "doc_name": "示例文档",
          "filename": "xxx.docx",
          "original_filename": "原始文件名.docx",
          "file_path": "projects/示例项目/uploads/xxx.docx",
          "project_name": "示例项目",
          "cycle": "阶段一",
          "upload_time": "2026-03-27T13:37:33.230431",
          "file_size": 82801,
          "has_signature": true,
          "has_seal": false,
          "signer": "",
          "sign_date": "",
          "doc_date": ""
        }
      ]
    }
  },
  "documents_archived": {
    "阶段一": {
      "示例文档": true
    }
  }
}
```

### 4.3 文档索引 (projects/{project}/data/documents_index.json)

```json
{
  "documents": {
    "项目立项_项目立项申请书_20260327_133733_0": {
      "doc_id": "阶段一_示例文档_20260327_133733_0",
      "doc_name": "示例文档",
      "filename": "示例文件.docx",
      "original_filename": "示例文件.docx",
      "file_path": "projects/示例项目/uploads/xxx/xxx.docx",
      "project_name": "示例项目",
      "cycle": "项目立项",
      "upload_time": "2026-03-27T13:37:33.230431",
      "source": "select",
      "file_size": 82801,
      "directory": "/",
      "has_signature": true,
      "has_seal": false
    }
  }
}
```

---

## 5. 后端模块详解

### 5.1 DocumentManager (app/utils/document_manager.py)

**核心类，采用组合模式管理所有子模块**

```python
class DocumentManager:
    """项目文档管理器主类"""
    
    def __init__(self, config=None):
        self.version = "2.1.0"
        self.documents_db = {}      # 文档数据库（内存缓存）
        self.config = config or BaseConfig()
        self._init_modules()
    
    def _init_modules(self):
        """初始化所有子模块"""
        self.cache = CacheManager(self.config)
        self.logger = OperationLogger(self.config)
        self.folders = FolderManager(self.config)
        self.naming = DocumentNamer(self.config)
        self.doc_lists = DocumentListManager(self.config, self.naming)
        self.archive = ArchiveManager(self.config, self.logger)
        self.exporter = ExportManager(self.config)
        self.requirements = RequirementsLoader(self.config)
        self.projects = ProjectManager(self.config)
        self.analyzer = ImageAnalyzer(self.config)
        self.uploader = DocumentUploader(self.config, self.analyzer, self.logger)
        self.data_manager = ProjectDataManager(self.config)
    
    # 项目管理
    def get_projects_list(self) -> List[Dict]: ...
    def create_project(self, name, description, cycles, required_docs) -> Dict: ...
    def load_project(self, project_name) -> Optional[Dict]: ...
    def save_project(self, project_name, config) -> bool: ...
    def delete_project(self, project_name) -> bool: ...
    
    # 文档管理
    def upload_document(self, file, metadata) -> Dict: ...
    def delete_document(self, doc_id) -> bool: ...
    def get_document_preview(self, doc_id) -> Dict: ...
    def detect_signature(self, image_path) -> tuple: ...
    def detect_seal(self, image_path) -> tuple: ...
    
    # 版本管理
    def save_version(self, project_name, description) -> Dict: ...
    def list_versions(self, project_name) -> List[Dict]: ...
    def restore_version(self, project_name, version_id) -> bool: ...
    
    # 导出
    def export_documents_package(self, project_name, options) -> str: ...
```

### 5.2 ImageAnalyzer (app/utils/image_analyzer.py)

**图像分析模块，使用OpenCV进行签字和盖章检测**

```python
class ImageAnalyzer:
    """图像分析器 - 用于检测签字和盖章"""
    
    def detect_signature(self, image_path: str) -> tuple:
        """
        检测签字
        使用Canny边缘检测 + 轮廓分析算法
        
        Returns:
            (has_signature: bool, confidence: float)
        """
        img = cv2.imread(image_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        # 分析轮廓特征判断是否有签字
        ...
    
    def detect_seal(self, image_path: str) -> tuple:
        """
        检测盖章
        使用颜色范围检测（红色/蓝色印章）+ 圆形检测
        
        Returns:
            (has_seal: bool, confidence: float)
        """
        img = cv2.imread(image_path)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        # 定义红色和蓝色范围
        lower_red = np.array([0, 100, 100])
        upper_red = np.array([10, 255, 255])
        mask = cv2.inRange(hsv, lower_red, upper_red)
        # 分析掩码判断是否有印章
        ...
```

### 5.3 ProjectDataManager (app/utils/project_data_manager.py)

**项目数据管理，处理JSON文件读写**

```python
class ProjectDataManager:
    """项目数据管理器"""
    
    def load_full_config(self, project_name: str) -> Optional[Dict]:
        """加载完整项目配置（从多个JSON文件合并）"""
        ...
    
    def save_full_config(self, project_name: str, config: Dict) -> bool:
        """保存完整项目配置（拆分保存到多个JSON文件）"""
        ...
    
    def add_document_to_index(self, project_name: str, doc_meta: Dict) -> bool:
        """添加文档到索引"""
        ...
    
    def remove_document_from_index(self, project_name: str, doc_id: str) -> bool:
        """从索引移除文档"""
        ...
    
    def load_documents_index(self, project_name: str) -> Dict:
        """加载文档索引"""
        ...
```

### 5.4 路由模块函数列表

#### documents/upload.py
```python
upload_document()           # POST /api/documents/upload
upload_chunk()              # POST /api/documents/upload/chunk
merge_chunks()              # POST /api/documents/upload/merge
```

#### documents/list.py
```python
list_documents()            # GET /api/documents/list
display_selected_files()    # 显示已选择文件列表（内部函数）
format_path_display()       # 格式化路径显示（内部函数）
```

#### documents/preview.py
```python
preview_document()          # GET /api/documents/preview/<id>
preview_document_local()    # GET /api/documents/preview-local/<id>
view_document()             # GET /api/documents/view/<id>
_get_document_metadata()    # 获取文档元数据（内部）
_resolve_file_path()        # 解析文件路径（内部）
```

#### documents/recognize.py
```python
smart_recognize()           # POST /api/documents/smart-recognize
```

#### documents/cleanup.py
```python
cleanup_duplicates()        # POST /api/documents/cleanup-duplicates
```

#### projects/basic.py
```python
list_projects()             # GET /api/projects/list
create_project()            # POST /api/projects/create
get_project()               # GET /api/projects/<id>
update_project()            # PUT /api/projects/<id>
delete_project()            # DELETE /api/projects/<id>
```

#### projects/export.py
```python
export_project()            # GET /api/projects/<id>/export
import_project()            # POST /api/projects/import
package_project()           # POST /api/projects/<id>/package
get_package_status()        # GET /api/projects/package/<task_id>/status
```

---

## 6. 前端模块详解

### 6.1 全局状态 (static/js/modules/app-state.js)

```javascript
// 应用全局状态
const appState = {
    // 当前项目
    projectConfig: null,         // 项目配置对象
    currentProjectId: null,      // 当前项目ID
    currentProjectName: null,    // 当前项目名称
    
    // 当前上下文
    currentCycle: null,          // 当前周期
    currentDocument: null,       // 当前文档类型
    
    // 数据缓存
    documents: {},               // 文档缓存
    documents_db: {},            // 文档数据库（从index加载）
    
    // ZIP选择
    zipSelectedFiles: [],        // ZIP中已选择的文件
    currentZipPackagePath: '',   // 当前ZIP包路径
    
    // 筛选选项
    filterOptions: {
        hideArchived: false,
        hideCompleted: false,
        keyword: ''
    },
    
    // 会话
    sessionId: null              // 会话ID（用于并发控制）
};
```

### 6.2 主要模块函数

#### document.js
```javascript
// 渲染周期文档列表
renderCycleDocuments(cycle, filterOptions)

// 文档操作
handleUploadDocument(e)
handleFileSelect(input, cycle, docName)
handleEditDocument(docId, cycle, docName)
handleDeleteDocument(docId)
handleReplaceDocument(docId, cycle, docName)

// 模态框
openUploadModal(cycle, docName)
openMaintainModal(cycle, docName)
openEditModal(docId, cycle, docName)

// 筛选
filterDocuments(cycle)

// 归档
archiveDocument(cycle, docName)
unarchiveDocument(cycle, docName)

// 预览
previewDocument(docId)

// 显示文件列表
displaySelectedFiles(files)
formatPathDisplay(path)
```

#### project.js
```javascript
handleCreateProject(formData)
selectProject(projectId)
loadProject(projectId)
renderProjectsList(projects)
```

#### cycle.js
```javascript
renderCycles()
calculateCycleProgress(cycle)
renderCycleNav(cycleData)
```

#### zip.js
```javascript
loadZipPackagesList()
searchZipFilesInPackage(keyword, packagePath)
handleZipFileSelect(e)
handleZipUpload(e, cycle, docName)
```

#### api.js
```javascript
// 项目API
loadProjectsList()
createProject(projectData)
loadProject(projectId)
saveProject(projectId, config)

// 文档API
uploadDocument(formData)
getDocument(docId)
deleteDocument(docId)
getCycleDocuments(cycle)

// ZIP API
loadZipPackages(projectId)
searchZipFiles(keyword, packagePath, projectId)
```

---

## 7. API接口文档

### 7.1 项目管理

| 方法 | 路径 | 功能 | 参数 |
|------|------|------|------|
| GET | `/api/projects/list` | 项目列表 | - |
| POST | `/api/projects/create` | 创建项目 | name, description, cycles, required_docs |
| GET | `/api/projects/<id>` | 获取项目 | project_id |
| PUT | `/api/projects/<id>` | 更新项目 | project_id, config |
| DELETE | `/api/projects/<id>` | 删除项目 | project_id |
| POST | `/api/projects/<id>/package` | 打包项目 | project_id |
| GET | `/api/projects/package/<task_id>/status` | 打包状态 | task_id |

### 7.2 文档管理

| 方法 | 路径 | 功能 | 参数 |
|------|------|------|------|
| POST | `/api/documents/upload` | 上传文档 | file, cycle, doc_name, ... |
| POST | `/api/documents/upload/chunk` | 分片上传 | chunk, chunk_index, total_chunks |
| POST | `/api/documents/upload/merge` | 合并分片 | filename, total_chunks |
| GET | `/api/documents/list` | 文档列表 | cycle, project_id |
| GET | `/api/documents/<id>` | 获取文档 | doc_id |
| DELETE | `/api/documents/<id>` | 删除文档 | doc_id |
| GET | `/api/documents/preview/<id>` | 预览文档 | doc_id |
| GET | `/api/documents/view/<id>` | 查看文档 | doc_id |
| GET | `/api/documents/download/<id>` | 下载文档 | doc_id |
| POST | `/api/documents/smart-recognize` | 智能识别 | file_path |
| POST | `/api/documents/cleanup-duplicates` | 清理重复 | project_name |

### 7.3 文件搜索

| 方法 | 路径 | 功能 | 参数 |
|------|------|------|------|
| GET | `/api/documents/directories` | 获取目录列表 | project_id |
| GET | `/api/documents/files/search` | 搜索文件 | keyword, directory, project_id |

### 7.4 任务管理

| 方法 | 路径 | 功能 | 参数 |
|------|------|------|------|
| POST | `/api/tasks/lock-project` | 锁定项目 | project_id |
| POST | `/api/tasks/unlock-project` | 解锁项目 | project_id |
| POST | `/api/tasks/heartbeat` | 心跳保活 | project_id, session_id |

---

## 8. 调用关系图

### 8.1 文档上传流程

```
用户选择文件
    │
    ▼
┌────────────────────────┐
│ 前端: handleUploadDoc  │
│ 或 handleFileSelect    │
└───────┬────────────────┘
        │ HTTP POST /api/documents/upload
        ▼
┌────────────────────────┐
│ upload.py:             │
│ upload_document()      │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│ DocumentManager:       │
│ upload_document()      │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│ DocumentUploader:      │
│ upload()               │
│ - 保存文件             │
│ - 图像分析（签字/盖章） │
│ - 更新项目配置         │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│ ProjectDataManager:    │
│ add_document_to_index()│
└───────┬────────────────┘
        │
        ▼
    返回结果
```

### 8.2 项目加载流程

```
用户选择项目
    │
    ▼
┌────────────────────────┐
│ 前端: selectProject()  │
└───────┬────────────────┘
        │ GET /api/projects/<id>
        ▼
┌────────────────────────┐
│ projects/basic.py:     │
│ get_project()          │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│ ProjectManager:        │
│ load_project()         │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│ ProjectDataManager:    │
│ load_full_config()     │
│ - 读取project_config   │
│ - 读取documents_index  │
│ - 合并数据             │
└───────┬────────────────┘
        │
        ▼
    返回项目配置
        │
        ▼
┌────────────────────────┐
│ 前端: cycle.js         │
│ renderCycles()         │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│ document.js:           │
│ renderCycleDocuments() │
└────────────────────────┘
```

### 8.3 图像识别流程

```
用户点击"智能识别"
    │
    ▼
┌────────────────────────┐
│ 前端: openEditModal    │
│ 或批量识别            │
└───────┬────────────────┘
        │ POST /api/documents/smart-recognize
        ▼
┌────────────────────────┐
│ recognize.py:          │
│ smart_recognize()      │
└───────┬────────────────┘
        │
        ├────────────────────┐
        ▼                    ▼
┌──────────────┐      ┌──────────────┐
│ detect_signature│    │ detect_seal  │
│ 边缘检测算法   │      │ 颜色分析算法 │
└──────────────┘      └──────────────┘
        │                    │
        ▼                    ▼
   返回签字结果          返回盖章结果
```

### 8.4 ZIP导入流程

```
用户选择ZIP文件
    │
    ▼
┌────────────────────────┐
│ 前端: handleZipUpload  │
└───────┬────────────────┘
        │ POST /api/documents/zip-import
        ▼
┌────────────────────────┐
│ zip.py: 解压ZIP        │
│ 提取文件列表           │
└───────┬────────────────┘
        │
        ▼
用户选择文件
    │
    ▼
┌────────────────────────┐
│ 前端: confirmSelection │
└───────┬────────────────┘
        │ POST 确认选择
        ▼
┌────────────────────────┐
│ ZIP匹配算法            │
│ - 匹配文档类型         │
│ - 复制文件             │
│ - 更新索引             │
└────────────────────────┘
```

---

## 附录A：关键技术实现

### A.1 组合模式实现

```python
# document_manager.py
class DocumentManager:
    def __init__(self, config):
        # 初始化所有子模块
        self.cache = CacheManager(config)
        self.logger = OperationLogger(config)
        self.folders = FolderManager(config)
        self.projects = ProjectManager(config)
        self.analyzer = ImageAnalyzer(config)
        self.uploader = DocumentUploader(config, self.analyzer, self.logger)
        
    def upload_document(self, file, metadata):
        # 委托给子模块处理
        result = self.uploader.upload(file, metadata)
        self.logger.log_operation('upload', metadata)
        return result
        
    def detect_signature(self, image_path):
        # 委托给图像分析模块
        return self.analyzer.detect_signature(image_path)
```

### A.2 前端模块化架构

```javascript
// main.js - 应用入口
import { initApp } from './modules/index.js';
document.addEventListener('DOMContentLoaded', initApp);

// index.js - 模块聚合
export { initApp } from './index.js';
export * from './project.js';
export * from './document.js';
export * from './cycle.js';
// ...

// app-state.js - 全局状态
export const appState = {
    projectConfig: null,
    currentProjectId: null,
    // ...
};

// api.js - API封装
export async function loadProjectsList() {
    const response = await fetch('/api/projects/list');
    return await response.json();
}
```

### A.3 数据分离存储策略

```python
# 项目配置和文档索引分离存储

# project_config.json - 存储项目结构和需求配置
{
    "name": "项目名",
    "cycles": [...],
    "documents": {
        "周期": {
            "required_docs": [...],   # 需求配置
            "uploaded_docs": [...]    # 已上传文档列表（精简信息）
        }
    }
}

# documents_index.json - 存储完整文档元数据
{
    "documents": {
        "doc_id": {
            # 完整文档信息
            "filename": "...",
            "file_path": "...",
            "has_signature": true,
            "has_seal": false,
            ...
        }
    }
}
```

---

**文档版本**: v1.0  
**最后更新**: 2026-04-11  
**作者**: AI Assistant
