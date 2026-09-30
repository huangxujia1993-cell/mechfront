// 分类与主题体系 —— 增删分类/主题在这里改
globalThis.TAXONOMY = {
  categories: [
    { key: "cad", name: "CAD 智能化", icon: "📐", desc: "建模、制图、CAD 内核与国产工业软件的 AI 化" },
    { key: "cae", name: "仿真与 CAE", icon: "🧮", desc: "AI 仿真、代理模型、物理 AI 与高性能计算" },
    { key: "robotics", name: "机器人与具身智能", icon: "🦾", desc: "人形机器人、具身智能及其研发工具链" },
    { key: "research", name: "生成式设计与学术前沿", icon: "🔬", desc: "text-to-CAD、设计 Agent、基准与数据集" },
    { key: "industrial", name: "工业大模型与数字孪生", icon: "🏭", desc: "工业大模型落地、数字孪生与产业政策" },
    { key: "market", name: "展会与资本", icon: "📈", desc: "行业展会、融资并购与上市动态" },
  ],
  topics: {
    companies: [
      { key: "autodesk", name: "Autodesk", aliases: ["Autodesk", "Fusion", "欧特克", "Bernini", "神经 CAD"] },
      { key: "siemens", name: "西门子 Siemens", aliases: ["西门子", "Siemens", "NX", "Solid Edge", "Simcenter", "Altair", "Eigen"] },
      { key: "3ds", name: "达索系统 Dassault", aliases: ["达索", "SOLIDWORKS", "CATIA", "3DEXPERIENCE", "Dassault", "LEO", "AURA", "MARIE"] },
      { key: "ptc", name: "PTC", aliases: ["PTC", "Creo", "Onshape"] },
      { key: "synopsys", name: "Synopsys / Ansys", aliases: ["Synopsys", "Ansys", "新思", "SimAI", "GeomAI"] },
      { key: "nvidia", name: "NVIDIA", aliases: ["NVIDIA", "英伟达", "PhysicsNeMo", "Cosmos", "Isaac", "GR00T", "Omniverse", "NemoClaw"] },
      { key: "zwsoft", name: "中望软件", aliases: ["中望", "ZWSOFT", "ZWCAD", "悟空", "ZW3D"] },
      { key: "hoteam", name: "华天软件", aliases: ["华天", "CrownCAD", "皇冠CAD", "CrownStyling"] },
      { key: "unitree", name: "宇树科技", aliases: ["宇树", "Unitree", "H2", "Superman"] },
      { key: "neuralconcept", name: "Neural Concept", aliases: ["Neural Concept"] },
      { key: "luminary", name: "Luminary Cloud", aliases: ["Luminary"] },
      { key: "ntop", name: "nTopology", aliases: ["nTopology", "nTop", "隐式几何"] },
      { key: "figure", name: "Figure AI", aliases: ["Figure", "Helix"] },
      { key: "huawei", name: "华为盘古", aliases: ["华为", "盘古", "FusionPlant"] },
    ],
    directions: [
      { key: "text2cad", name: "文本/图像生成 CAD", aliases: ["text-to-CAD", "Text2CAD", "image-to-CAD", "CAD 生成", "参数化重建", "CAD 基础模型"] },
      { key: "agent", name: "工程智能体", aliases: ["智能体", "Agent", "Copilot", "副驾", "Engineering Agent"] },
      { key: "sim-ai", name: "AI 仿真与代理模型", aliases: ["代理模型", "降阶模型", "ROM", "物理 AI", "PhysicsAI", "SimAI"] },
      { key: "gENDesign", name: "生成式设计与拓扑优化", aliases: ["生成式设计", "拓扑优化", "点阵", "隐式建模"] },
      { key: "embodied", name: "具身智能", aliases: ["具身智能", "人形机器人", "VLA", "世界模型"] },
      { key: "twin", name: "数字孪生", aliases: ["数字孪生", "Omniverse", "世界模型"] },
    ],
    formats: [
      { key: "product", name: "产品发布" },
      { key: "funding", name: "融资并购" },
      { key: "paper", name: "学术论文" },
      { key: "event", name: "展会活动" },
      { key: "policy", name: "政策标准" },
      { key: "oss", name: "开源发布" },
    ],
  },
};
if (typeof module !== "undefined") module.exports = globalThis.TAXONOMY;
