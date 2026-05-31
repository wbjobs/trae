class SubtitleRenderer {
    constructor() {
        this.currentSubtitles = [];
        this.maxSubtitles = 3;
        this.subtitleDisplayTime = 5000;
        this.fontSize = 28;
        this.fontFamily = 'Microsoft YaHei, PingFang SC, sans-serif';
        this.enableSubtitle = true;
    }

    addSubtitle(text, timestamp = Date.now(), latency = 0) {
        if (!this.enableSubtitle) return;
        
        const subtitle = {
            text,
            timestamp,
            latency,
            opacity: 1
        };
        
        this.currentSubtitles.push(subtitle);
        
        if (this.currentSubtitles.length > this.maxSubtitles) {
            this.currentSubtitles.shift();
        }
        
        setTimeout(() => {
            this.removeSubtitle(timestamp);
        }, this.subtitleDisplayTime);
    }

    removeSubtitle(timestamp) {
        const index = this.currentSubtitles.findIndex(s => s.timestamp === timestamp);
        if (index !== -1) {
            this.currentSubtitles.splice(index, 1);
        }
    }

    clear() {
        this.currentSubtitles = [];
    }

    setFontSize(size) {
        this.fontSize = size;
    }

    setEnable(enable) {
        this.enableSubtitle = enable;
        if (!enable) {
            this.clear();
        }
    }

    wrapText(ctx, text, maxWidth) {
        const words = text.split('');
        const lines = [];
        let currentLine = '';
        
        for (const char of words) {
            const testLine = currentLine + char;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines;
    }

    render(ctx, canvasWidth, canvasHeight) {
        if (!this.enableSubtitle || this.currentSubtitles.length === 0) {
            return;
        }

        const paddingX = 40;
        const paddingY = 30;
        const lineHeight = this.fontSize * 1.4;
        const maxWidth = canvasWidth - paddingX * 2;
        
        ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        
        const allLines = [];
        for (const subtitle of this.currentSubtitles) {
            const lines = this.wrapText(ctx, subtitle.text, maxWidth);
            for (const line of lines) {
                allLines.push({
                    text: line,
                    opacity: subtitle.opacity
                });
            }
        }
        
        const startY = canvasHeight - paddingY - (allLines.length - 1) * lineHeight;
        
        allLines.forEach((line, index) => {
            const y = startY + index * lineHeight;
            const text = line.text;
            
            ctx.globalAlpha = line.opacity * 0.9;
            
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            const gradient = ctx.createLinearGradient(
                paddingX, y - this.fontSize,
                paddingX, y + 5
            );
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#e0e0e0');
            
            ctx.fillStyle = gradient;
            ctx.fillText(text, canvasWidth / 2, y);
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(text, canvasWidth / 2, y);
        });
        
        ctx.globalAlpha = 1;
    }

    getLatestLatency() {
        if (this.currentSubtitles.length === 0) return 0;
        return this.currentSubtitles[this.currentSubtitles.length - 1].latency;
    }
}

window.SubtitleRenderer = SubtitleRenderer;
