class FakeSubtitleGenerator {
    constructor() {
        this.subjects = [
            '系统正在运行',
            '用户正在操作',
            '视频处理中',
            '实时监控画面',
            '数据传输正常',
            '网络连接稳定',
            '程序执行顺利',
            '任务进行中',
            '状态保持良好',
            '服务正常响应',
            '处理器占用率适中',
            '内存使用正常',
            '磁盘空间充足',
            '带宽使用合理',
            '延迟在可控范围内',
            '编码效率稳定',
            '解码速度正常',
            '渲染帧率达标',
            '缓冲区数据充足',
            '同步机制工作正常'
        ];
        
        this.verbs = [
            '正在处理',
            '持续监控',
            '实时更新',
            '自动优化',
            '智能调节',
            '动态适配',
            '平稳运行',
            '高效执行',
            '快速响应',
            '稳定输出',
            '精准控制',
            '灵活调整',
            '安全传输',
            '可靠存储',
            '及时同步'
        ];
        
        this.objects = [
            '视频流数据',
            '音频信号',
            '图像帧',
            '网络数据包',
            '系统资源',
            '用户请求',
            '任务队列',
            '缓存数据',
            '配置参数',
            '状态信息',
            '传感器数据',
            '控制指令',
            '反馈信号',
            '校准数据',
            '统计信息'
        ];
        
        this.suffixes = [
            '[加密传输]',
            '[安全模式]',
            '[已验证]',
            '[校验通过]',
            '[正常]',
            '[稳定]',
            '[高效]',
            '[优化中]',
            '[自适应]',
            '[智能]'
        ];
        
        this.lastSubtitles = [];
        this.maxHistory = 5;
    }

    generate() {
        let subtitle;
        let attempts = 0;
        
        do {
            const pattern = Math.floor(Math.random() * 4);
            
            switch (pattern) {
                case 0:
                    subtitle = `${this.randomFrom(this.subjects)}，${this.randomFrom(this.verbs)}${this.randomFrom(this.objects)}`;
                    break;
                case 1:
                    subtitle = `${this.randomFrom(this.verbs)}${this.randomFrom(this.objects)} ${this.randomFrom(this.suffixes)}`;
                    break;
                case 2:
                    subtitle = `${this.randomFrom(this.subjects)} ${this.randomFrom(this.suffixes)}`;
                    break;
                case 3:
                    subtitle = `${this.randomFrom(this.verbs)}${this.randomFrom(this.objects)}，${this.randomFrom(this.subjects)}`;
                    break;
            }
            
            attempts++;
        } while (this.lastSubtitles.includes(subtitle) && attempts < 10);
        
        this.lastSubtitles.push(subtitle);
        if (this.lastSubtitles.length > this.maxHistory) {
            this.lastSubtitles.shift();
        }
        
        return subtitle;
    }

    randomFrom(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    start(callback, interval = 2500) {
        this.stop();
        
        const generateAndCallback = () => {
            const subtitle = this.generate();
            callback(subtitle);
            this.timer = setTimeout(generateAndCallback, interval + Math.random() * 1500);
        };
        
        generateAndCallback();
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

window.FakeSubtitleGenerator = FakeSubtitleGenerator;
