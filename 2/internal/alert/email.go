package alert

import (
	"bytes"
	"fmt"
	"html/template"
	"log"
	"net/smtp"
	"strings"
	"time"

	"github.com/distributed-scheduler/internal/config"
	"github.com/distributed-scheduler/internal/models"
	"github.com/distributed-scheduler/internal/repository"
)

type EmailService struct {
	alertRepo *repository.AlertRepository
}

var emailService *EmailService

func InitEmailService() {
	emailService = &EmailService{
		alertRepo: repository.NewAlertRepository(),
	}
}

func GetEmailService() *EmailService {
	return emailService
}

func (s *EmailService) SendAlert(task *models.Task, alertType models.AlertType, executionID string, errorMsg string) error {
	cfg := config.GetConfig().Email
	if !cfg.Enabled {
		log.Printf("Email alert is disabled, skipping alert for task %s", task.ID)
		return nil
	}

	alertConfig, err := s.getTaskAlertConfig(task.ID)
	if err != nil {
		log.Printf("Failed to get alert config for task %s: %v", task.ID, err)
		return err
	}

	if alertConfig == nil || !alertConfig.Enabled {
		log.Printf("Alert not enabled for task %s", task.ID)
		return nil
	}

	if !s.shouldSendAlert(alertConfig, alertType) {
		log.Printf("Alert type %s not configured for task %s", alertType, task.ID)
		return nil
	}

	canSend, err := s.alertRepo.CheckCooldown(task.ID, alertType, alertConfig.CooldownSeconds)
	if err != nil {
		log.Printf("Failed to check cooldown for task %s: %v", task.ID, err)
	} else if !canSend {
		log.Printf("Alert for task %s is in cooldown, skipping", task.ID)
		return nil
	}

	subject := s.getAlertSubject(task.Name, alertType)
	body := s.getAlertBody(task, alertType, executionID, errorMsg)

	for _, recipient := range alertConfig.EmailRecipients {
		if err := s.sendEmail(recipient, subject, body); err != nil {
			log.Printf("Failed to send email to %s: %v", recipient, err)
			s.saveAlertRecord(task.ID, executionID, alertType, recipient, subject, body, err)
		} else {
			s.saveAlertRecord(task.ID, executionID, alertType, recipient, subject, body, nil)
		}
	}

	return nil
}

func (s *EmailService) shouldSendAlert(alertConfig *models.AlertConfig, alertType models.AlertType) bool {
	for _, t := range alertConfig.AlertTypes {
		if t == alertType {
			return true
		}
	}
	return false
}

func (s *EmailService) getAlertSubject(taskName string, alertType models.AlertType) string {
	switch alertType {
	case models.AlertTypeTaskFailed:
		return fmt.Sprintf("[告警] 任务执行失败: %s", taskName)
	case models.AlertTypeTaskTimeout:
		return fmt.Sprintf("[告警] 任务执行超时: %s", taskName)
	case models.AlertTypeRetryLimitExceeded:
		return fmt.Sprintf("[告警] 任务重试次数超限: %s", taskName)
	case models.AlertTypeResourceExceeded:
		return fmt.Sprintf("[告警] 任务资源超限: %s", taskName)
	default:
		return fmt.Sprintf("[告警] 任务异常: %s", taskName)
	}
}

func (s *EmailService) getAlertBody(task *models.Task, alertType models.AlertType, executionID, errorMsg string) string {
	data := map[string]interface{}{
		"TaskID":      task.ID,
		"TaskName":    task.Name,
		"TaskType":    task.TaskType,
		"AlertType":   alertType,
		"ExecutionID": executionID,
		"ErrorMsg":    errorMsg,
		"Time":        time.Now().Format("2006-01-02 15:04:05"),
		"Status":      task.Status,
		"Description": task.Description,
	}

	tmpl := `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ff6b6b; color: white; padding: 20px; border-radius: 5px; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-top: 10px; }
        .info-item { margin: 10px 0; }
        .label { font-weight: bold; color: #666; }
        .error { background-color: #ffeaea; padding: 10px; border-radius: 5px; margin-top: 10px; }
        .footer { margin-top: 20px; font-size: 12px; color: #999; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>⚠️ 任务告警通知</h2>
        </div>
        <div class="content">
            <div class="info-item">
                <span class="label">任务名称：</span>{{.TaskName}}
            </div>
            <div class="info-item">
                <span class="label">任务ID：</span>{{.TaskID}}
            </div>
            <div class="info-item">
                <span class="label">告警类型：</span>{{.AlertType}}
            </div>
            <div class="info-item">
                <span class="label">执行ID：</span>{{.ExecutionID}}
            </div>
            <div class="info-item">
                <span class="label">当前状态：</span>{{.Status}}
            </div>
            <div class="info-item">
                <span class="label">告警时间：</span>{{.Time}}
            </div>
            {{if .ErrorMsg}}
            <div class="error">
                <div class="label">错误信息：</div>
                <pre>{{.ErrorMsg}}</pre>
            </div>
            {{end}}
            {{if .Description}}
            <div class="info-item">
                <span class="label">任务描述：</span>{{.Description}}
            </div>
            {{end}}
        </div>
        <div class="footer">
            此邮件由分布式任务调度系统自动发送，请勿回复。
        </div>
    </div>
</body>
</html>
`

	t, err := template.New("email").Parse(tmpl)
	if err != nil {
		log.Printf("Failed to parse email template: %v", err)
		return s.getPlainTextBody(data)
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		log.Printf("Failed to execute email template: %v", err)
		return s.getPlainTextBody(data)
	}

	return buf.String()
}

func (s *EmailService) getPlainTextBody(data map[string]interface{}) string {
	var sb strings.Builder
	sb.WriteString("任务告警通知\n")
	sb.WriteString("================\n\n")
	sb.WriteString(fmt.Sprintf("任务名称: %s\n", data["TaskName"]))
	sb.WriteString(fmt.Sprintf("任务ID: %s\n", data["TaskID"]))
	sb.WriteString(fmt.Sprintf("告警类型: %s\n", data["AlertType"]))
	sb.WriteString(fmt.Sprintf("执行ID: %s\n", data["ExecutionID"]))
	sb.WriteString(fmt.Sprintf("当前状态: %s\n", data["Status"]))
	sb.WriteString(fmt.Sprintf("告警时间: %s\n", data["Time"]))
	if data["ErrorMsg"] != "" {
		sb.WriteString(fmt.Sprintf("\n错误信息: %s\n", data["ErrorMsg"]))
	}
	return sb.String()
}

func (s *EmailService) sendEmail(to, subject, body string) error {
	cfg := config.GetConfig().Email

	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	from := cfg.FromEmail
	if from == "" {
		from = cfg.Username
	}

	fromName := cfg.FromName
	if fromName == "" {
		fromName = "分布式任务调度系统"
	}

	headers := make(map[string]string)
	headers["From"] = fmt.Sprintf("%s <%s>", fromName, from)
	headers["To"] = to
	headers["Subject"] = subject
	headers["Content-Type"] = "text/html; charset=UTF-8"
	headers["MIME-Version"] = "1.0"

	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")
	msg.WriteString(body)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg.String()))
}

func (s *EmailService) getTaskAlertConfig(taskID string) (*models.AlertConfig, error) {
	return s.alertRepo.GetAlertConfigByTaskID(taskID)
}

func (s *EmailService) saveAlertRecord(taskID, executionID string, alertType models.AlertType, recipient, subject, body string, sendErr error) {
	now := time.Now()
	record := &models.AlertRecord{
		TaskID:      taskID,
		ExecutionID: executionID,
		AlertType:   alertType,
		Channel:     models.AlertChannelEmail,
		Recipient:   recipient,
		Subject:     subject,
		Message:     body,
		CreatedAt:   now,
	}

	if sendErr == nil {
		record.SentAt = &now
	} else {
		record.Error = sendErr.Error()
	}

	if err := s.alertRepo.CreateAlertRecord(record); err != nil {
		log.Printf("Failed to save alert record: %v", err)
	}
}

func TriggerTaskAlert(task *models.Task, alertType models.AlertType, executionID, errorMsg string) {
	if emailService == nil {
		return
	}
	if err := emailService.SendAlert(task, alertType, executionID, errorMsg); err != nil {
		log.Printf("Failed to trigger alert for task %s: %v", task.ID, err)
	}
}
