import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from services.clip_service import CLIPService
from services.vector_db import VectorDBService

sample_texts = [
    "一辆蓝色的跑车在高速公路上行驶",
    "红色的苹果放在木质桌子上",
    "一只可爱的猫咪在阳光下打盹",
    "美丽的日落海滩，海浪轻轻拍打着岸边",
    "现代化的城市天际线，高楼大厦林立",
    "穿着西装的商务人士在办公室工作",
    "郁郁葱葱的森林，阳光透过树叶洒落",
    "一盘美味的意大利面，配有番茄酱和罗勒",
    "一辆红色的自行车停在花园里",
    "一只小狗在草地上快乐地奔跑",
    "一杯热气腾腾的咖啡放在书桌上",
    "雪山倒映在宁静的湖面上",
    "穿着婚纱的新娘在花园中微笑",
    "一盘新鲜的水果沙拉",
    "古老的城堡矗立在山顶上",
    "一辆黑色的轿车停在车库前",
    "黄色的向日葵花田在微风中摇曳",
    "一位厨师正在厨房里准备美食",
    "星空下的露营帐篷",
    "一只蝴蝶停在盛开的花朵上",
]

sample_image_texts = [
    ("蓝色汽车", "一辆蓝色的现代汽车，外观时尚"),
    ("红色苹果", "新鲜红润的苹果，富含维生素"),
    ("可爱猫咪", "毛茸茸的宠物猫，眼神温柔"),
    ("海滩日落", "金色夕阳下的美丽海景"),
    ("城市风景", "繁华都市的现代化建筑"),
]

def main():
    print("初始化服务...")
    clip_service = CLIPService()
    vector_db = VectorDBService()
    
    print(f"\n当前索引数量: {vector_db.count()}")
    
    print("\n正在索引文本数据...")
    for i, text in enumerate(sample_texts):
        embedding = clip_service.encode_text(text)
        vector_db.add_item(
            embedding=embedding.tolist(),
            text=text,
            metadata={"category": "text_sample", "index": i}
        )
        print(f"  [{i+1}/{len(sample_texts)}] {text[:30]}...")
    
    print("\n正在索引示例图文数据...")
    for i, (title, desc) in enumerate(sample_image_texts):
        combined_text = f"{title}。{desc}"
        embedding = clip_service.encode_text(combined_text)
        vector_db.add_item(
            embedding=embedding.tolist(),
            text=combined_text,
            image_path=None,
            metadata={"category": "image_sample", "title": title, "index": i}
        )
        print(f"  [{i+1}/{len(sample_image_texts)}] {title}")
    
    print(f"\n索引完成！当前总索引数量: {vector_db.count()}")
    print("\n现在可以启动服务进行搜索测试了！")
    print("运行: python -m backend.app.main")

if __name__ == "__main__":
    main()
