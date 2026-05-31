const { Notification } = require('electron');
const log = require('electron-log');

class NotificationsService {
  constructor() {
    this.isSupported = Notification.isSupported();
    if (!this.isSupported) {
      log.warn('System notifications are not supported');
    }
  }

  show(title, body, options = {}) {
    if (!this.isSupported) {
      log.info(`Notification (unsupported): ${title} - ${body}`);
      return;
    }

    try {
      const notification = new Notification({
        title,
        body,
        silent: options.silent || false,
        urgency: options.urgency || 'normal',
        timeoutType: options.timeoutType || 'default',
      });

      notification.on('click', () => {
        log.info(`Notification clicked: ${title}`);
      });

      notification.on('close', () => {
        log.info(`Notification closed: ${title}`);
      });

      notification.show();
      log.info(`Notification shown: ${title} - ${body}`);
    } catch (error) {
      log.error('Failed to show notification:', error);
    }
  }

  showGeofenceEnter(peerNickname, geofenceName) {
    this.show(
      '进入地理围栏',
      `${peerNickname} 进入了 ${geofenceName}`,
      { urgency: 'normal' }
    );
  }

  showGeofenceLeave(peerNickname, geofenceName) {
    this.show(
      '离开地理围栏',
      `${peerNickname} 离开了 ${geofenceName}`,
      { urgency: 'normal' }
    );
  }

  showMemberJoin(peerNickname) {
    this.show(
      '新成员加入',
      `${peerNickname} 加入了房间`,
      { urgency: 'low' }
    );
  }

  showMemberLeave(peerNickname) {
    this.show(
      '成员离开',
      `${peerNickname} 离开了房间`,
      { urgency: 'low' }
    );
  }
}

module.exports = NotificationsService;
