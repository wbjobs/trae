export class APIService {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
    }
    
    async listFiles() {
        const response = await fetch(`${this.baseUrl}/files`);
        return this._handleResponse(response);
    }
    
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${this.baseUrl}/upload`, {
            method: 'POST',
            body: formData
        });
        
        return this._handleResponse(response);
    }
    
    async loadPointCloud(filename) {
        const response = await fetch(`${this.baseUrl}/load/${encodeURIComponent(filename)}`);
        return this._handleResponse(response);
    }
    
    async buildOctree(filename, options = {}) {
        const response = await fetch(`${this.baseUrl}/octree/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        
        return this._handleResponse(response);
    }
    
    async getOctreeNodes(filename, level = null, lodBias = 1.0) {
        let url = `${this.baseUrl}/octree/${encodeURIComponent(filename)}/nodes`;
        const params = new URLSearchParams();
        
        if (level !== null) {
            params.append('level', level);
        }
        params.append('lod_bias', lodBias);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        return this._handleResponse(response);
    }
    
    async getNodeBinary(filename, nodeId) {
        const response = await fetch(
            `${this.baseUrl}/octree/${encodeURIComponent(filename)}/node/${nodeId}/binary`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        return {
            nodeId,
            pointCount: parseInt(response.headers.get('X-Point-Count') || '0'),
            depth: parseInt(response.headers.get('X-Depth') || '0'),
            data: buffer
        };
    }
    
    async getSamplePoints(filename, count = 100000) {
        const response = await fetch(
            `${this.baseUrl}/points/${encodeURIComponent(filename)}/sample?count=${count}`
        );
        return this._handleResponse(response);
    }
    
    async _handleResponse(response) {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        return data;
    }
}
