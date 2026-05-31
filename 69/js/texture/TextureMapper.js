export class TextureMapper {
    constructor() {
        this.textureCache = new Map();
        this.patternCache = new Map();
    }

    generateStratumTexture(stratum, width = 512, height = 512) {
        const cacheKey = `${stratum.id}_${width}_${height}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const baseColor = this.hexToRgb(stratum.color);
        this.fillBaseTexture(ctx, width, height, baseColor);

        switch (stratum.nameEn) {
            case 'Topsoil':
                this.generateSoilTexture(ctx, width, height, baseColor);
                break;
            case 'Silty Clay':
                this.generateClayTexture(ctx, width, height, baseColor);
                break;
            case 'Sandy Silt':
                this.generateSiltTexture(ctx, width, height, baseColor);
                break;
            case 'Gravel':
                this.generateGravelTexture(ctx, width, height, baseColor);
                break;
            case 'Highly Weathered Rock':
                this.generateWeatheredRockTexture(ctx, width, height, baseColor);
                break;
            case 'Moderately Weathered Rock':
                this.generateRockTexture(ctx, width, height, baseColor, 0.6);
                break;
            case 'Slightly Weathered Rock':
                this.generateRockTexture(ctx, width, height, baseColor, 0.3);
                break;
            default:
                this.generateGenericTexture(ctx, width, height, baseColor);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.anisotropy = 16;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;

        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    fillBaseTexture(ctx, width, height, color) {
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.fillRect(0, 0, width, height);
    }

    generateSoilTexture(ctx, width, height, baseColor) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = this.noise2D((i / 4) % width, Math.floor((i / 4) / width));
            const variation = Math.floor(noise * 30);
            
            data[i] = Math.max(0, Math.min(255, baseColor.r + variation - 15));
            data[i + 1] = Math.max(0, Math.min(255, baseColor.g + variation - 15));
            data[i + 2] = Math.max(0, Math.min(255, baseColor.b + variation - 10));
        }

        ctx.putImageData(imageData, 0, 0);

        for (let i = 0; i < 200; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 2 + 1;
            
            ctx.fillStyle = `rgba(${baseColor.r - 40}, ${baseColor.g - 40}, ${baseColor.b - 30}, 0.5)`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        this.addStratificationLines(ctx, width, height, baseColor, 0.1);
    }

    generateClayTexture(ctx, width, height, baseColor) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const x = (i / 4) % width;
            const y = Math.floor((i / 4) / width);
            const noise = this.noise2D(x * 0.05, y * 0.05);
            const variation = Math.floor(noise * 20);
            
            data[i] = Math.max(0, Math.min(255, baseColor.r + variation - 10));
            data[i + 1] = Math.max(0, Math.min(255, baseColor.g + variation - 10));
            data[i + 2] = Math.max(0, Math.min(255, baseColor.b + variation - 5));
        }

        ctx.putImageData(imageData, 0, 0);
        this.addStratificationLines(ctx, width, height, baseColor, 0.3);
        this.addCracks(ctx, width, height, baseColor, 10);
    }

    generateSiltTexture(ctx, width, height, baseColor) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = this.noise2D((i / 4) % width * 0.1, Math.floor((i / 4) / width) * 0.1);
            const variation = Math.floor(noise * 25);
            
            data[i] = Math.max(0, Math.min(255, baseColor.r + variation));
            data[i + 1] = Math.max(0, Math.min(255, baseColor.g + variation - 5));
            data[i + 2] = Math.max(0, Math.min(255, baseColor.b + variation - 10));
        }

        ctx.putImageData(imageData, 0, 0);

        for (let i = 0; i < 500; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 1.5 + 0.5;
            const alpha = Math.random() * 0.3 + 0.1;
            
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        this.addStratificationLines(ctx, width, height, baseColor, 0.2);
    }

    generateGravelTexture(ctx, width, height, baseColor) {
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 8 + 3;
            
            const r = Math.max(0, Math.min(255, baseColor.r + Math.random() * 40 - 20));
            const g = Math.max(0, Math.min(255, baseColor.g + Math.random() * 40 - 20));
            const b = Math.max(0, Math.min(255, baseColor.b + Math.random() * 40 - 20));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            ctx.beginPath();
            ctx.ellipse(x, y, size, size * (0.6 + Math.random() * 0.4), Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = `rgba(0, 0, 0, 0.2)`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        this.addStratificationLines(ctx, width, height, baseColor, 0.15);
    }

    generateWeatheredRockTexture(ctx, width, height, baseColor) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const x = (i / 4) % width;
            const y = Math.floor((i / 4) / width);
            const noise = this.noise2D(x * 0.08, y * 0.08);
            const variation = Math.floor(noise * 50);
            
            data[i] = Math.max(0, Math.min(255, baseColor.r + variation - 25));
            data[i + 1] = Math.max(0, Math.min(255, baseColor.g + variation - 25));
            data[i + 2] = Math.max(0, Math.min(255, baseColor.b + variation - 25));
        }

        ctx.putImageData(imageData, 0, 0);
        this.addCracks(ctx, width, height, baseColor, 20);
        this.addRockVein(ctx, width, height, baseColor);
    }

    generateRockTexture(ctx, width, height, baseColor, crackDensity) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const x = (i / 4) % width;
            const y = Math.floor((i / 4) / width);
            const noise = this.noise2D(x * 0.1, y * 0.1);
            const variation = Math.floor(noise * 30);
            
            data[i] = Math.max(0, Math.min(255, baseColor.r + variation - 15));
            data[i + 1] = Math.max(0, Math.min(255, baseColor.g + variation - 15));
            data[i + 2] = Math.max(0, Math.min(255, baseColor.b + variation - 15));
        }

        ctx.putImageData(imageData, 0, 0);
        this.addCracks(ctx, width, height, baseColor, 15 * crackDensity);
        this.addRockVein(ctx, width, height, baseColor);
    }

    generateGenericTexture(ctx, width, height, baseColor) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = this.noise2D((i / 4) % width * 0.05, Math.floor((i / 4) / width) * 0.05);
            const variation = Math.floor(noise * 20);
            
            data[i] = Math.max(0, Math.min(255, baseColor.r + variation));
            data[i + 1] = Math.max(0, Math.min(255, baseColor.g + variation));
            data[i + 2] = Math.max(0, Math.min(255, baseColor.b + variation));
        }

        ctx.putImageData(imageData, 0, 0);
        this.addStratificationLines(ctx, width, height, baseColor, 0.1);
    }

    addStratificationLines(ctx, width, height, baseColor, intensity) {
        ctx.strokeStyle = `rgba(${baseColor.r - 30}, ${baseColor.g - 30}, ${baseColor.b - 30}, ${intensity})`;
        ctx.lineWidth = 1;

        for (let i = 0; i < height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            
            for (let x = 0; x < width; x += 10) {
                const yOffset = Math.sin(x * 0.1 + i * 0.5) * 2;
                ctx.lineTo(x, i + yOffset);
            }
            
            ctx.stroke();
        }
    }

    addCracks(ctx, width, height, baseColor, count) {
        ctx.strokeStyle = `rgba(0, 0, 0, 0.4)`;
        ctx.lineWidth = 1;

        for (let i = 0; i < count; i++) {
            const startX = Math.random() * width;
            const startY = Math.random() * height;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            let x = startX;
            let y = startY;
            const steps = Math.random() * 10 + 5;
            
            for (let j = 0; j < steps; j++) {
                x += (Math.random() - 0.5) * 30;
                y += (Math.random() - 0.5) * 30;
                x = Math.max(0, Math.min(width, x));
                y = Math.max(0, Math.min(height, y));
                ctx.lineTo(x, y);
            }
            
            ctx.stroke();
        }
    }

    addRockVein(ctx, width, height, baseColor) {
        for (let i = 0; i < 5; i++) {
            const startY = Math.random() * height;
            const endY = startY + (Math.random() - 0.5) * 100;
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;
            ctx.lineWidth = Math.random() * 2 + 1;
            
            ctx.beginPath();
            ctx.moveTo(0, startY);
            
            for (let x = 0; x < width; x += 5) {
                const yOffset = Math.sin(x * 0.05 + i) * 10;
                const y = startY + (endY - startY) * (x / width) + yOffset;
                ctx.lineTo(x, y);
            }
            
            ctx.stroke();
        }
    }

    noise2D(x, y) {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    hexToRgb(hex) {
        const r = (hex >> 16) & 255;
        const g = (hex >> 8) & 255;
        const b = hex & 255;
        return { r, g, b };
    }

    createStratumMaterial(stratum, useTexture = true) {
        if (useTexture) {
            const texture = this.generateStratumTexture(stratum);
            return new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.8,
                metalness: 0.1,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide
            });
        } else {
            return new THREE.MeshStandardMaterial({
                color: stratum.color,
                roughness: 0.9,
                metalness: 0.05,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide
            });
        }
    }

    createEdgeMaterial(color = 0x000000, opacity = 0.3) {
        return new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity
        });
    }

    createWireframeMaterial(color = 0xffffff, opacity = 0.2) {
        return new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: opacity
        });
    }

    dispose() {
        this.textureCache.forEach(texture => {
            texture.dispose();
        });
        this.textureCache.clear();
        this.patternCache.clear();
    }
}
