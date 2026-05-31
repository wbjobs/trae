import smtplib
import aiohttp
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from datetime import datetime

from models import AlertRule, AnomalyRecord, AlertHistory
from schemas import AlertRuleCreate, AlertRuleUpdate
from config import settings

class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_alert_rule(self, rule: AlertRuleCreate) -> AlertRule:
        db_rule = AlertRule(**rule.dict())
        self.db.add(db_rule)
        await self.db.commit()
        await self.db.refresh(db_rule)
        return db_rule
    
    async def get_all_alert_rules(self) -> List[AlertRule]:
        result = await self.db.execute(
            select(AlertRule).options(selectinload(AlertRule.anomaly_rule))
        )
        return result.scalars().all()
    
    async def get_alert_rule_by_id(self, id: int) -> AlertRule:
        result = await self.db.execute(
            select(AlertRule)
            .where(AlertRule.id == id)
            .options(selectinload(AlertRule.anomaly_rule))
        )
        return result.scalars().first()
    
    async def update_alert_rule(self, id: int, rule: AlertRuleUpdate) -> AlertRule:
        db_rule = await self.get_alert_rule_by_id(id)
        if db_rule:
            update_data = rule.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_rule, key, value)
            await self.db.commit()
            await self.db.refresh(db_rule)
        return db_rule
    
    async def delete_alert_rule(self, id: int) -> bool:
        db_rule = await self.get_alert_rule_by_id(id)
        if db_rule:
            await self.db.delete(db_rule)
            await self.db.commit()
            return True
        return False
    
    async def _log_alert_history(
        self,
        alert_rule: AlertRule,
        anomaly_record: Optional[AnomalyRecord],
        channel_type: str,
        status: str,
        error_message: Optional[str] = None,
        response_data: Optional[Dict[str, Any]] = None
    ) -> AlertHistory:
        history = AlertHistory(
            alert_rule_id=alert_rule.id,
            anomaly_record_id=anomaly_record.id if anomaly_record else None,
            channel_type=channel_type,
            status=status,
            error_message=error_message,
            response_data=response_data
        )
        self.db.add(history)
        await self.db.commit()
        await self.db.refresh(history)
        return history
    
    async def get_alert_history(
        self,
        alert_rule_id: Optional[int] = None,
        limit: int = 100
    ) -> List[AlertHistory]:
        query = select(AlertHistory).options(
            selectinload(AlertHistory.alert_rule),
            selectinload(AlertHistory.anomaly_record)
        )
        
        if alert_rule_id:
            query = query.where(AlertHistory.alert_rule_id == alert_rule_id)
        
        query = query.order_by(desc(AlertHistory.sent_at)).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def send_email_alert(
        self,
        recipients: List[str],
        subject: str,
        body: str
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        try:
            if not settings.smtp_host or not settings.smtp_username:
                error_msg = "SMTP configuration is incomplete. Please set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD in .env"
                return False, error_msg, None
            
            msg = MIMEMultipart()
            msg['From'] = settings.smtp_username
            msg['To'] = ', '.join(recipients)
            msg['Subject'] = subject
            
            msg.attach(MIMEText(body, 'html'))
            
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            text = msg.as_string()
            server.sendmail(settings.smtp_username, recipients, text)
            server.quit()
            
            return True, None, {
                "recipients": recipients,
                "subject": subject,
                "sent_at": datetime.utcnow().isoformat()
            }
            
        except smtplib.SMTPAuthenticationError as e:
            error_msg = f"SMTP Authentication Error: Invalid username or password. Code: {e.smtp_code}, Message: {e.smtp_error}"
            print(f"Email auth error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"smtp_code": e.smtp_code}
            
        except smtplib.SMTPConnectError as e:
            error_msg = f"SMTP Connection Error: Could not connect to {settings.smtp_host}:{settings.smtp_port}. Code: {e.smtp_code}"
            print(f"Email connect error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"host": settings.smtp_host, "port": settings.smtp_port}
            
        except Exception as e:
            error_msg = f"Email Error: {str(e)}"
            print(f"Email error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"error_type": type(e).__name__}
    
    async def send_dingding_alert(
        self,
        webhook_url: str,
        title: str,
        content: str
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        try:
            if not webhook_url:
                error_msg = "DingTalk webhook URL is not configured"
                return False, error_msg, None
            
            message = {
                "msgtype": "markdown",
                "markdown": {
                    "title": title,
                    "text": f"### {title}\n\n{content}"
                }
            }
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.post(webhook_url, json=message) as response:
                    status_code = response.status
                    response_text = await response.text()
                    
                    if status_code != 200:
                        error_msg = f"DingTalk HTTP Error: Status {status_code}. Response: {response_text}"
                        print(f"Dingding HTTP error: {error_msg}")
                        return False, error_msg, {
                            "status_code": status_code,
                            "response": response_text
                        }
                    
                    result = await response.json()
                    
                    errcode = result.get("errcode")
                    errmsg = result.get("errmsg", "")
                    
                    if errcode == 0:
                        return True, None, result
                    else:
                        error_msg = f"DingTalk API Error: {errmsg} (code: {errcode})"
                        print(f"Dingding API error: {error_msg}")
                        return False, error_msg, result
                        
        except aiohttp.ClientConnectorError as e:
            error_msg = f"DingTalk Connection Error: Could not connect to webhook. {str(e)}"
            print(f"Dingding connect error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"webhook": webhook_url[:50] + "..." if len(webhook_url) > 50 else webhook_url}
            
        except Exception as e:
            error_msg = f"DingTalk Error: {str(e)}"
            print(f"Dingding error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"error_type": type(e).__name__}
    
    async def send_wechat_alert(
        self,
        webhook_url: str,
        title: str,
        content: str
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        try:
            if not webhook_url:
                error_msg = "WeChat Work webhook URL is not configured"
                return False, error_msg, None
            
            message = {
                "msgtype": "markdown",
                "markdown": {
                    "content": f"### {title}\n\n{content}"
                }
            }
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.post(webhook_url, json=message) as response:
                    status_code = response.status
                    response_text = await response.text()
                    
                    if status_code != 200:
                        error_msg = f"WeChat Work HTTP Error: Status {status_code}. Response: {response_text}"
                        print(f"WeChat HTTP error: {error_msg}")
                        return False, error_msg, {
                            "status_code": status_code,
                            "response": response_text
                        }
                    
                    result = await response.json()
                    
                    errcode = result.get("errcode")
                    errmsg = result.get("errmsg", "")
                    
                    if errcode == 0:
                        return True, None, result
                    else:
                        error_msg = f"WeChat Work API Error: {errmsg} (code: {errcode})"
                        print(f"WeChat API error: {error_msg}")
                        return False, error_msg, result
                        
        except aiohttp.ClientConnectorError as e:
            error_msg = f"WeChat Work Connection Error: Could not connect to webhook. {str(e)}"
            print(f"WeChat connect error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"webhook": webhook_url[:50] + "..." if len(webhook_url) > 50 else webhook_url}
            
        except Exception as e:
            error_msg = f"WeChat Work Error: {str(e)}"
            print(f"WeChat error: {error_msg}")
            traceback.print_exc()
            return False, error_msg, {"error_type": type(e).__name__}
    
    def _format_alert_message(self, record: AnomalyRecord) -> Dict[str, str]:
        severity_colors = {
            "critical": "#ff0000",
            "high": "#ff6600",
            "medium": "#ffcc00",
            "low": "#99cc00"
        }
        color = severity_colors.get(record.severity, "#999999")
        
        datasource_name = record.datasource.name if record.datasource else 'Unknown'
        
        title = f"【{record.severity.upper()}】时序数据异常告警"
        
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: {color}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">⚠️ 异常检测告警</h2>
            </div>
            <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background-color: #f5f5f5;">
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; width: 120px;">数据源</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">{datasource_name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">异常时间</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">{record.timestamp}</td>
                    </tr>
                    <tr style="background-color: #f5f5f5;">
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">异常值</td>
                        <td style="padding: 12px; border: 1px solid #ddd; font-size: 18px; color: {color};">{record.value}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">严重程度</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <span style="background-color: {color}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;">
                                {record.severity.upper()}
                            </span>
                        </td>
                    </tr>
                    <tr style="background-color: #f5f5f5;">
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">描述</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">{record.description}</td>
                    </tr>
                </table>
                <p style="margin-top: 20px; color: #999; font-size: 12px; text-align: center;">
                    此邮件由异常检测平台自动发送，请及时处理。
                </p>
            </div>
        </div>
        """
        
        markdown_body = f"""### ⚠️ 时序数据异常告警

**数据源**: {datasource_name}
**异常时间**: {record.timestamp}
**异常值**: <font color="{color}">{record.value}</font>
**严重程度**: <font color="{color}">{record.severity.upper()}</font>
**描述**: {record.description}

> 此消息由异常检测平台自动发送，请及时处理。
        """
        
        return {
            "title": title,
            "html": html_body,
            "markdown": markdown_body
        }
    
    async def send_alert(
        self,
        alert_rule: AlertRule,
        anomaly_record: AnomalyRecord
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        message = self._format_alert_message(anomaly_record)
        channel_config = alert_rule.channel_config
        
        success = False
        error_msg = None
        response_data = None
        
        if alert_rule.channel_type == "email":
            recipients = channel_config.get("recipients", [])
            if not recipients:
                error_msg = "Email recipients not configured"
            else:
                success, error_msg, response_data = await self.send_email_alert(
                    recipients,
                    message["title"],
                    message["html"]
                )
                
        elif alert_rule.channel_type == "dingding":
            webhook = channel_config.get("webhook", settings.dingding_webhook)
            success, error_msg, response_data = await self.send_dingding_alert(
                webhook,
                message["title"],
                message["markdown"]
            )
            
        elif alert_rule.channel_type == "wechat":
            webhook = channel_config.get("webhook", settings.wechat_webhook)
            success, error_msg, response_data = await self.send_wechat_alert(
                webhook,
                message["title"],
                message["markdown"]
            )
        else:
            error_msg = f"Unknown channel type: {alert_rule.channel_type}"
        
        await self._log_alert_history(
            alert_rule=alert_rule,
            anomaly_record=anomaly_record,
            channel_type=alert_rule.channel_type,
            status="success" if success else "failed",
            error_message=error_msg,
            response_data=response_data
        )
        
        return success, error_msg, response_data
    
    async def get_alert_rules_for_anomaly_rule(self, anomaly_rule_id: int) -> List[AlertRule]:
        result = await self.db.execute(
            select(AlertRule)
            .where(
                AlertRule.anomaly_rule_id == anomaly_rule_id,
                AlertRule.is_active == True
            )
        )
        return result.scalars().all()
    
    async def process_anomaly_alerts(
        self,
        anomaly_records: List[AnomalyRecord],
        anomaly_rule_id: int
    ) -> Dict[str, Any]:
        alert_rules = await self.get_alert_rules_for_anomaly_rule(anomaly_rule_id)
        
        if not alert_rules:
            return {
                "success": True, 
                "alerts_sent": 0, 
                "alerts_failed": 0,
                "message": "No active alert rules",
                "details": []
            }
        
        sent_count = 0
        failed_count = 0
        details = []
        
        for record in anomaly_records:
            for alert_rule in alert_rules:
                success, error_msg, response_data = await self.send_alert(alert_rule, record)
                
                detail = {
                    "alert_rule_id": alert_rule.id,
                    "alert_rule_name": alert_rule.name,
                    "channel_type": alert_rule.channel_type,
                    "anomaly_record_id": record.id,
                    "success": success,
                    "error_message": error_msg
                }
                details.append(detail)
                
                if success:
                    sent_count += 1
                else:
                    failed_count += 1
        
        return {
            "success": failed_count == 0,
            "alerts_sent": sent_count,
            "alerts_failed": failed_count,
            "alert_rules_count": len(alert_rules),
            "anomalies_count": len(anomaly_records),
            "details": details
        }
