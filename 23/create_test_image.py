from PIL import Image
import numpy as np


def create_test_image():
    width, height = 256, 256
    img_array = np.zeros((height, width, 3), dtype=np.uint8)
    
    for i in range(height):
        for j in range(width):
            r = (i + j) % 256
            g = (2 * i + j) % 256
            b = (i + 2 * j) % 256
            img_array[i, j] = [r, g, b]
    
    img = Image.fromarray(img_array)
    img.save('test_image.jpg', 'JPEG', quality=95)
    print("测试图片 test_image.jpg 已创建")


if __name__ == "__main__":
    create_test_image()
