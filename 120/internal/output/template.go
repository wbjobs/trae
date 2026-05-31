package output

const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>多云资源巡检报告</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .header h1 { font-size: 28px; margin-bottom: 8px; }
  .header .meta { opacity: 0.9; font-size: 14px; }
  .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
  .card .label { color: #666; font-size: 14px; margin-bottom: 8px; }
  .card .value { font-size: 32px; font-weight: 700; color: #333; }
  .card.critical .value { color: #e74c3c; }
  .card.high .value { color: #f39c12; }
  .card.medium .value { color: #f1c40f; }
  .card.low .value { color: #27ae60; }
  .section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
  .section h2 { font-size: 20px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #f0f0f0; color: #2c3e50; }
  .account-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .account-header .badge { background: #667eea; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .account-header h3 { font-size: 18px; color: #2c3e50; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-weight: 600; color: #555; font-size: 13px; text-transform: uppercase; }
  tr:hover { background: #f8f9fa; }
  .risk-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .risk-critical { background: #fee; color: #e74c3c; }
  .risk-high { background: #fef5e7; color: #e67e22; }
  .risk-medium { background: #fef9e7; color: #f1c40f; }
  .risk-low { background: #eafaf1; color: #27ae60; }
  .category-tag { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; background: #eef2ff; color: #667eea; }
  .resource-table { font-size: 14px; }
  .resource-table .type { font-family: monospace; color: #667eea; }
  .empty-state { text-align: center; padding: 40px; color: #999; }
  .details-btn { background: none; border: 1px solid #ddd; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; color: #666; }
  .details-btn:hover { background: #f0f0f0; }
  .details-row { display: none; }
  .details-row.active { display: table-row; }
  .details-content { background: #f8f9fa; padding: 16px; border-radius: 8px; }
  .details-content pre { background: white; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
  .progress-bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); }
  @media (max-width: 768px) {
    .summary-cards { grid-template-columns: repeat(2, 1fr); }
    table { font-size: 12px; }
    th, td { padding: 8px; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>多云资源巡检报告</h1>
    <div class="meta">生成时间: {{.GeneratedAt}}</div>
  </div>

  <div class="summary-cards">
    <div class="card">
      <div class="label">总资源数</div>
      <div class="value">{{.Summary.TotalResources}}</div>
    </div>
    <div class="card critical">
      <div class="label">严重风险</div>
      <div class="value">{{index .Summary.RiskByLevel "CRITICAL"}}</div>
    </div>
    <div class="card high">
      <div class="label">高危风险</div>
      <div class="value">{{index .Summary.RiskByLevel "HIGH"}}</div>
    </div>
    <div class="card medium">
      <div class="label">中危风险</div>
      <div class="value">{{index .Summary.RiskByLevel "MEDIUM"}}</div>
    </div>
    <div class="card low">
      <div class="label">低危风险</div>
      <div class="value">{{index .Summary.RiskByLevel "LOW"}}</div>
    </div>
  </div>

  {{range .Results}}
  <div class="section">
    <div class="account-header">
      <h3>账号: {{.Account}}</h3>
      <span class="badge">{{.Provider}}</span>
    </div>
    <p style="color:#666; margin-bottom:16px;">资源: {{len .Resources}} | 风险: {{len .Risks}}</p>

    {{if .Risks}}
    <h4 style="margin-bottom:12px; color:#e74c3c;">风险项</h4>
    <table>
      <thead>
        <tr>
          <th>等级</th>
          <th>类别</th>
          <th>资源</th>
          <th>类型</th>
          <th>描述</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {{range .Risks}}
        <tr>
          <td><span class="risk-badge risk-{{riskClass .Level}}">{{.Level}}</span></td>
          <td><span class="category-tag">{{.Category}}</span></td>
          <td>{{.ResourceName}}</td>
          <td>{{.ResourceType}}</td>
          <td>{{.Message}}</td>
          <td><button class="details-btn" onclick="toggleDetails('{{.ResourceID}}')">详情</button></td>
        </tr>
        <tr class="details-row" id="details-{{.ResourceID}}">
          <td colspan="6">
            <div class="details-content">
              <strong>资源ID:</strong> {{.ResourceID}}<br>
              <strong>区域:</strong> {{.Region}}<br>
              <strong>账号:</strong> {{.Account}}<br>
              {{if .Details}}
              <strong>详细信息:</strong>
              <pre>{{formatJSON .Details}}</pre>
              {{end}}
            </div>
          </td>
        </tr>
        {{end}}
      </tbody>
    </table>
    {{else}}
    <div class="empty-state">未发现风险项</div>
    {{end}}

    {{if .Resources}}
    <h4 style="margin:24px 0 12px; color:#2c3e50;">资源列表</h4>
    <table class="resource-table">
      <thead>
        <tr>
          <th>类型</th>
          <th>名称</th>
          <th>ID</th>
          <th>状态</th>
          <th>区域</th>
        </tr>
      </thead>
      <tbody>
        {{range .Resources}}
        <tr>
          <td><span class="type">{{.Type}}</span></td>
          <td>{{.Name}}</td>
          <td style="font-family:monospace; font-size:12px;">{{.ID}}</td>
          <td>{{.Status}}</td>
          <td>{{.Region}}</td>
        </tr>
        {{end}}
      </tbody>
    </table>
    {{end}}
  </div>
  {{end}}
</div>

<script>
function toggleDetails(id) {
  var row = document.getElementById('details-' + id);
  if (row) {
    row.classList.toggle('active');
  }
}
</script>
</body>
</html>`
