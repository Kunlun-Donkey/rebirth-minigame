# 美术需求 · 命格「一条毛毛虫」`destiny/caterpillar/` ·「一只皮皮虾」`destiny/mantis_shrimp/`

> 两个命格的 15 张图都已用 SVG 程序化生成入库（`npm run art -- caterpillar` / `npm run art -- mantis_shrimp`，源码 [tools/art/gen-art.mjs](../../tools/art/gen-art.mjs) §11、§12），扁平剪影风格，可直接上线。
> 想换 AI 精修版：按下方提示词生成，**同名**放入对应目录，并从 gen-art.mjs 删掉该条目防覆盖。放入后跑 `npm run art:check` 检查比例与透明底。
> 尺寸、目录规则同 [requests-local_dog.md](requests-local_dog.md)：`main_bg` 放主包 `assets/resources/textures/destiny/<id>/`，其余放分包 `assets/subres/textures/destiny/<id>/`。

| 文件 | 尺寸 | 状态 |
|---|---|---|
| `main_bg.jpg`（主包） | 1080×1920 | ✅ SVG |
| `settle_bg.jpg` · `settle_bg_ending.jpg` | 1080×1920 | ✅ SVG |
| `cover.jpg` | 512×512 | ✅ SVG |
| `stage_1..5.png`（透明） | 512×512 | ✅ SVG |
| `companion_*.png`（圆章） | 256×256 | ✅ SVG（毛毛虫：ladybug snail cricket ant spider old_cicada；皮皮虾：clownfish hermit_crab seahorse goby urchin old_turtle） |
| `epitaph_card` | 1380×600 | 可选，未做（回落通用石板） |

## 风格
- 毛毛虫：**嫩绿 + 花粉黄**，春天的菜园 / 果园 / 公园，主角是一条胖乎乎的绿毛毛虫，终极形象是金橙色大蝴蝶。
- 皮皮虾：**海蓝 + 珊瑚橙**，浅海、珊瑚、沙洞，主角是一只橙红色的皮皮虾（螳螂虾：分节身体、扇形尾、折叠在胸前的一对「拳头」、带柄的大眼睛），终极形象站在浪尖上。
- 统一后缀：整体为东方幻想风格的扁平厚涂插画，带细腻的纸张颗粒质感，光影柔和，构图干净。画面中不要出现任何文字、字母、数字、水印、签名或logo，不要血腥恐怖或低俗元素，不要照片写实或3D渲染效果。

## 提示词（主体描述，末尾接上「统一后缀」）
- 毛毛虫 `main_bg` 9:16：画面最底部五分之一是几片大叶子和小花，一条小小的绿色毛毛虫趴在叶子上；上方五分之四是干净的浅绿到米白天空，留白用于叠加文字。
- 毛毛虫 `settle_bg` 9:16：夜晚，画面底部一根细枝上挂着一个发着淡绿光的空茧，周围几只萤火虫；上方大面积深蓝夜空和淡月，留白。
- 毛毛虫 `settle_bg_ending` 9:16：清晨花田上空，一只巨大的金橙色蝴蝶展翅，周围几只小蝴蝶；上半部分明亮暖金色天空留白。
- 毛毛虫 `cover` 1:1：一条胖胖的绿毛毛虫趴在叶子上抬头，叶尖挂着一颗露珠，背后淡淡的蝴蝶影子。
- 皮皮虾 `main_bg` 9:16：画面最底部是浅色沙地、珊瑚和礁石，一只小皮皮虾趴在洞口；上方五分之四是透亮的浅蓝海水和斜射的光束，留白。
- 皮皮虾 `settle_bg` 9:16：夜晚的深海，底部一个空沙洞，洞口有一只发光的旧虾壳，几串气泡往上飘；上方大面积深蓝留白。
- 皮皮虾 `settle_bg_ending` 9:16：日出的海面，一只巨大的橙红色皮皮虾站在浪尖上，身后金色太阳；上半部分暖金色天空留白。
- 皮皮虾 `cover` 1:1：一只橙红色皮皮虾在珊瑚前出拳，拳头前面有几道速度线和水花。
