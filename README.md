# Floorplan Editor

一款基于 Web 的户型图编辑器，支持 2D 平面绘制与 3D 实时预览。

在线访问：https://hanno.website

## 功能特性

- **2D 户型编辑**：基于 Konva 的高性能画布，支持墙体、房间、门窗、家具等元素的绘制与编辑
- **3D 实时预览**：基于 Three.js 的即时 3D 渲染，平面改动立即可见
- **图层管理**：多图层切换与显隐控制
- **属性面板**：选中元素实时编辑属性
- **家具库**：内置常用家具模型，支持拖拽放置
- **相机预设**：多视角快速切换（俯视、漫游等）
- **标尺辅助**：画布标尺与对齐吸附

## 技术栈

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) 构建工具
- [Konva](https://konvajs.org/) 2D 图形引擎（[react-konva](https://github.com/konvajs/react-konva)）
- [Three.js](https://threejs.org/) 3D 渲染引擎
- [Zustand](https://github.com/pmndrs/zustand) 状态管理

## 本地开发

```bash
# 克隆项目
git clone https://github.com/vaynewilliam2017-web/floorplan_editor.git
cd floorplan_editor

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器访问 `http://localhost:5173`

## 构建部署

```bash
npm run build
```

构建产物输出到 `dist/` 目录，可直接部署到任何静态托管服务（Nginx、Vercel、GitHub Pages 等）。

### Nginx 部署示例

```nginx
server {
    listen 80;
    server_name hanno.website;

    root /home/ubuntu/01_floorplan_editor/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 项目结构

```
floorplan-editor/
├── src/
│   ├── components/      # React 组件
│   │   ├── FloorplanStage.tsx   # 2D 编辑画布
│   │   ├── ThreePreview.tsx     # 3D 预览面板
│   │   ├── ThreeWorkspace.tsx   # 3D 工作区
│   │   ├── PropertiesDrawer.tsx # 属性抽屉
│   │   ├── FurniturePanel.tsx   # 家具库面板
│   │   ├── LayerPanel.tsx       # 图层面板
│   │   └── ...
│   ├── lib/
│   │   ├── schema.ts       # 户型数据结构定义
│   │   ├── types.ts        # TypeScript 类型
│   │   ├── usePlanStore.ts # 全局状态管理
│   │   ├── geometry.ts     # 几何计算工具
│   │   ├── snapping.ts     # 吸附对齐逻辑
│   │   ├── operations.ts   # 编辑操作逻辑
│   │   └── furniture/      # 家具目录与定义
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
└── vite.config.ts
```

## 数据格式

编辑器使用自定义的 FloorplanJSON 格式描述户型数据，包含：

- `boundary` / `boundary_expand` — 外轮廓
- `entrance` / `entrance_expand` — 入户区域
- `rooms` — 房间列表（含类别、边界、名称等）
- `doors` / `windows` — 门窗数据
- `walls` — 墙体信息（含厚度、承重状态）
- `columns` — 柱网数据
- `furniture` — 家具布置
- `calibration` — 像素/毫米校准信息

## License

MIT
