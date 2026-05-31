package reporter

import (
	"fmt"
	"html/template"
	"strings"
	"time"
)

type HTMLReporter struct{}

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency Security Audit Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; background: #f5f7fa; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header .meta { opacity: 0.9; font-size: 14px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .summary-card .label { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .summary-card .value { font-size: 36px; font-weight: bold; }
        .critical .value { color: #dc3545; }
        .high .value { color: #fd7e14; }
        .medium .value { color: #ffc107; }
        .low .value { color: #28a745; }
        .section { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .section h2 { font-size: 20px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #eee; }
        .vuln-list { list-style: none; }
        .vuln-item { padding: 20px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 15px; transition: box-shadow 0.2s; }
        .vuln-item:hover { box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .vuln-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .vuln-id { font-weight: bold; font-size: 18px; color: #667eea; }
        .severity-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .severity-critical { background: #dc3545; color: white; }
        .severity-high { background: #fd7e14; color: white; }
        .severity-medium { background: #ffc107; color: #333; }
        .severity-low { background: #28a745; color: white; }
        .vuln-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px; }
        .detail-item { background: #f8f9fa; padding: 10px 15px; border-radius: 5px; }
        .detail-label { font-size: 12px; color: #666; text-transform: uppercase; }
        .detail-value { font-weight: 500; margin-top: 5px; }
        .vuln-desc { color: #555; line-height: 1.8; margin-bottom: 15px; }
        .suggestion { background: #e7f3ff; border-left: 4px solid #667eea; padding: 15px; border-radius: 4px; margin-bottom: 15px; }
        .suggestion strong { color: #667eea; }
        .references { margin-top: 10px; }
        .references strong { color: #666; }
        .references ul { margin-top: 5px; padding-left: 20px; }
        .references a { color: #667eea; text-decoration: none; }
        .references a:hover { text-decoration: underline; }
        .fix-result { padding: 15px; border-radius: 5px; margin-bottom: 10px; }
        .fix-success { background: #d4edda; border-left: 4px solid #28a745; }
        .fix-failed { background: #f8d7da; border-left: 4px solid #dc3545; }
        .fix-rolledback { background: #fff3cd; border-left: 4px solid #ffc107; }
        .no-vulns { text-align: center; padding: 50px; color: #28a745; font-size: 18px; }
        .no-vulns .icon { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Dependency Security Audit Report</h1>
            <div class="meta">
                <strong>Project:</strong> {{.ProjectPath}} &nbsp;|&nbsp;
                <strong>Language:</strong> {{.Language}} &nbsp;|&nbsp;
                <strong>Scan Time:</strong> {{.ScanTime}}
            </div>
        </div>

        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Total Dependencies</div>
                <div class="value">{{.TotalDeps}}</div>
            </div>
            <div class="summary-card critical">
                <div class="label">Critical</div>
                <div class="value">{{.Summary.CriticalCount}}</div>
            </div>
            <div class="summary-card high">
                <div class="label">High</div>
                <div class="value">{{.Summary.HighCount}}</div>
            </div>
            <div class="summary-card medium">
                <div class="label">Medium</div>
                <div class="value">{{.Summary.MediumCount}}</div>
            </div>
            <div class="summary-card low">
                <div class="label">Low</div>
                <div class="value">{{.Summary.LowCount}}</div>
            </div>
        </div>

        {{if .Vulnerabilities}}
        <div class="section">
            <h2>Vulnerabilities Found</h2>
            <ul class="vuln-list">
                {{range .Vulnerabilities}}
                <li class="vuln-item">
                    <div class="vuln-header">
                        <span class="vuln-id">{{.ID}}</span>
                        <span class="severity-badge severity-{{.Severity | ToLower}}">{{.Severity}}</span>
                    </div>
                    <div class="vuln-details">
                        <div class="detail-item">
                            <div class="detail-label">Package</div>
                            <div class="detail-value">{{.PackageName}}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Current Version</div>
                            <div class="detail-value">{{.AffectedVersions}}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">CVSS Score</div>
                            <div class="detail-value">{{.CVSS}}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Ecosystem</div>
                            <div class="detail-value">{{.Ecosystem}}</div>
                        </div>
                    </div>
                    <div class="vuln-desc">{{.Description}}</div>
                    {{if .FixedVersions}}
                    <div class="detail-item">
                        <div class="detail-label">Fixed Versions</div>
                        <div class="detail-value">{{JoinStrings .FixedVersions ", "}}</div>
                    </div>
                    {{end}}
                    {{if .Suggestion}}
                    <div class="suggestion">
                        <strong>💡 Suggestion:</strong> {{.Suggestion}}
                    </div>
                    {{end}}
                    {{if .References}}
                    <div class="references">
                        <strong>📚 References:</strong>
                        <ul>
                            {{range .References}}
                                {{if IsValidURL .}}
                                <li><a href="{{NormalizeURL .}}" target="_blank" rel="noopener noreferrer">{{.}}</a></li>
                                {{else}}
                                <li>{{.}}</li>
                                {{end}}
                            {{end}}
                        </ul>
                    </div>
                    {{end}}
                </li>
                {{end}}
            </ul>
        </div>
        {{else}}
        <div class="section">
            <div class="no-vulns">
                <div class="icon">✅</div>
                <strong>No vulnerabilities found!</strong>
                <p>All {{.TotalDeps}} dependencies are secure.</p>
            </div>
        </div>
        {{end}}

        {{if .FixResults}}
        <div class="section">
            <h2>Auto-Fix Results</h2>
            {{range .FixResults}}
                {{if .Success}}
                <div class="fix-result fix-success">
                    <strong>✅ {{.PackageName}}</strong><br>
                    Updated: {{.FromVersion}} → {{.ToVersion}}
                </div>
                {{else if .Rollbacked}}
                <div class="fix-result fix-rolledback">
                    <strong>⚠️ {{.PackageName}}</strong><br>
                    Update failed, rolled back to original version.
                    {{if .Error}}<br><small>Error: {{.Error}}</small>{{end}}
                </div>
                {{else}}
                <div class="fix-result fix-failed">
                    <strong>❌ {{.PackageName}}</strong><br>
                    Update failed.
                    {{if .Error}}<br><small>Error: {{.Error}}</small>{{end}}
                </div>
                {{end}}
            {{end}}
        </div>
        {{end}}
    </div>
</body>
</html>`

func (r *HTMLReporter) Name() string { return "html" }

func isValidURL(url string) bool {
	url = strings.TrimSpace(url)
	if url == "" {
		return false
	}
	return strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://")
}

func normalizeURL(url string) string {
	url = strings.TrimSpace(url)
	if url == "" {
		return "#"
	}
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return "https://" + url
	}
	return url
}

func (r *HTMLReporter) Generate(report *Report) (string, error) {
	funcMap := template.FuncMap{
		"ToLower": strings.ToLower,
		"JoinStrings": func(slice []string, sep string) string {
			return strings.Join(slice, sep)
		},
		"NormalizeURL": normalizeURL,
		"IsValidURL": isValidURL,
	}
	
	tmpl, err := template.New("report").Funcs(funcMap).Parse(htmlTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %v", err)
	}
	
	data := struct {
		*Report
		ScanTime string
	}{
		Report:   report,
		ScanTime: report.ScanTime.Format(time.RFC1123),
	}
	
	var sb strings.Builder
	if err := tmpl.Execute(&sb, data); err != nil {
		return "", fmt.Errorf("failed to execute template: %v", err)
	}
	
	return sb.String(), nil
}
